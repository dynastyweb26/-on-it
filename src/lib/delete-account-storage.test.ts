// Account-deletion Storage cleanup. The important case is invoice attachments:
// objects live at ${user_id}/${invoice_id}/${uuid}.jpg, so a one-level list
// would leave them behind. The fake mirrors Supabase list()/remove() semantics,
// including folders reported with id: null and pagination.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCOUNT_STORAGE_BUCKETS,
  clearAccountStorage,
  type AccountStorageAdmin,
} from './delete-account-storage';

const U = '1f58b401-e1b1-41e9-b11f-df5530872007';
const OTHER = '2a58b401-e1b1-41e9-b11f-df5530872008';

type FakeEntry = {
  id: string | null;
  name: string;
  metadata: { size: number } | null;
  updated_at: string | null;
  created_at: string | null;
  last_accessed_at: string | null;
};

function fakeAdmin(
  initial: Record<string, string[]>,
  failRemove?: (bucket: string, paths: string[]) => boolean,
  silentRemove?: (bucket: string, paths: string[]) => boolean,
  failList?: (bucket: string, prefix: string) => boolean,
) {
  const objects = new Map<string, Set<string>>();
  for (const [bucket, paths] of Object.entries(initial)) {
    objects.set(bucket, new Set(paths));
  }

  const calls: string[] = [];
  const admin: AccountStorageAdmin = {
    storage: {
      from(bucket: string) {
        const store = objects.get(bucket) ?? new Set<string>();
        objects.set(bucket, store);

        return {
          async list(prefix: string, options: { limit?: number; offset?: number } = {}) {
            calls.push(`list:${bucket}:${prefix}`);
            if (failList?.(bucket, prefix)) {
              return { data: null, error: { message: 'list nope' } };
            }

            const limit = options.limit ?? 100;
            const offset = options.offset ?? 0;

            // One level only, exactly like Supabase: immediate files plus
            // folders (id: null), never grandchildren. The null metadata and
            // timestamp fields match the real list() shape observed from the
            // service-role client.
            const entries = new Map<string, FakeEntry>();
            for (const path of store) {
              if (!path.startsWith(`${prefix}/`)) continue;
              const rest = path.slice(prefix.length + 1);
              const slash = rest.indexOf('/');
              const name = slash === -1 ? rest : rest.slice(0, slash);
              const key = `${slash === -1 ? 'file' : 'folder'}:${name}`;
              if (!entries.has(key)) {
                const isFolder = slash !== -1;
                entries.set(key, {
                  id: isFolder ? null : `id:${path}`,
                  name,
                  metadata: isFolder ? null : { size: 1 },
                  updated_at: isFolder ? null : '2026-10-20T00:00:00.000Z',
                  created_at: isFolder ? null : '2026-10-20T00:00:00.000Z',
                  last_accessed_at: isFolder ? null : '2026-10-20T00:00:00.000Z',
                });
              }
            }

            const all = [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
            return { data: all.slice(offset, offset + limit), error: null };
          },

          async remove(paths: string[]) {
            calls.push(`remove:${bucket}:${paths.length}`);
            if (failRemove?.(bucket, paths)) return { error: { message: 'nope' } };
            if (silentRemove?.(bucket, paths)) return { error: null };
            for (const path of paths) store.delete(path);
            return { error: null };
          },
        };
      },
    },
  };

  return { admin, objects, calls };
}

test('account deletion empties flat and nested user folders, leaving other users', async () => {
  const { admin, objects } = fakeAdmin({
    vault: [`${U}/doc.pdf`, `${U}/nested/deep.pdf`],
    logos: [`${U}/logo.png`],
    receipts: [`${U}/receipt-hash.jpg`],
    'invoice-attachments': [
      `${U}/inv-1/a.jpg`,
      `${U}/inv-1/b.jpg`,
      `${U}/inv-2/c.jpg`,
      `${OTHER}/inv-9/keep.jpg`,
    ],
  });

  await clearAccountStorage(admin, U);

  for (const bucket of ACCOUNT_STORAGE_BUCKETS) {
    const left = [...(objects.get(bucket) ?? [])].filter((path) =>
      path.startsWith(`${U}/`),
    );
    assert.deepEqual(left, [], `${bucket} still has user objects`);

    const listed = await admin.storage.from(bucket).list(U);
    assert.deepEqual(listed.data, [], `${bucket} still lists user objects`);
  }

  assert.deepEqual(
    [...(objects.get('invoice-attachments') ?? [])],
    [`${OTHER}/inv-9/keep.jpg`],
  );
});

test('walks a folder listed alongside a file at the same level', async () => {
  const { admin, objects, calls } = fakeAdmin({
    vault: [],
    logos: [],
    receipts: [],
    'invoice-attachments': [`${U}/top.txt`, `${U}/inv-1/nested.txt`],
  });

  await clearAccountStorage(admin, U);

  assert.deepEqual([...(objects.get('invoice-attachments') ?? [])], []);
  assert.ok(calls.includes(`list:invoice-attachments:${U}`));
  assert.ok(calls.includes(`list:invoice-attachments:${U}/inv-1`));
  assert.ok(calls.includes('remove:invoice-attachments:1'));
});

test('removes .emptyFolderPlaceholder objects too', async () => {
  const { admin, objects } = fakeAdmin({
    vault: [],
    logos: [],
    receipts: [],
    'invoice-attachments': [
      `${U}/inv-1/.emptyFolderPlaceholder`,
      `${U}/inv-1/a.jpg`,
    ],
  });

  await clearAccountStorage(admin, U);

  assert.equal(objects.get('invoice-attachments')?.size, 0);
});

test('more than 100 entries at a nested level are all removed', async () => {
  const paths = Array.from(
    { length: 250 },
    (_, i) => `${U}/inv-1/${String(i).padStart(4, '0')}.jpg`,
  );
  const { admin, objects, calls } = fakeAdmin({
    vault: [],
    logos: [],
    receipts: [],
    'invoice-attachments': paths,
  });

  await clearAccountStorage(admin, U);

  assert.equal(objects.get('invoice-attachments')?.size, 0);
  const removeCounts = calls
    .filter((call) => call.startsWith('remove:invoice-attachments:'))
    .map((call) => Number(call.split(':')[2]));
  assert.ok(removeCounts.every((count) => count <= 100));
  assert.equal(
    removeCounts.reduce((sum, count) => sum + count, 0),
    250,
  );
});

test('refuses folders that try to escape the user root', async () => {
  const { admin, objects } = fakeAdmin({
    vault: [],
    logos: [],
    receipts: [],
    'invoice-attachments': [
      `${U}/../${OTHER}/inv-1/keep.jpg`,
      `${U}/inv-1/a.jpg`,
    ],
  });

  await assert.rejects(
    () => clearAccountStorage(admin, U),
    /refusing out-of-prefix path/,
  );

  assert.ok(
    objects
      .get('invoice-attachments')
      ?.has(`${U}/../${OTHER}/inv-1/keep.jpg`),
  );
});

test('empty, undefined and non-UUID user ids throw before touching storage', async () => {
  const { admin, objects, calls } = fakeAdmin({
    vault: [`${U}/a.pdf`],
    logos: [],
    receipts: [],
    'invoice-attachments': [],
  });

  for (const bad of ['', undefined, null, 'abc', '../', `${U}/..`, '*'] as unknown[]) {
    await assert.rejects(
      () => clearAccountStorage(admin, bad as string),
      /valid UUID/,
    );
  }

  assert.equal(calls.length, 0);
  assert.equal(objects.get('vault')?.size, 1);
});

test('account deletion is idempotent when the user has no objects', async () => {
  const { admin } = fakeAdmin({
    vault: [],
    logos: [],
    receipts: [],
    'invoice-attachments': [],
  });

  await clearAccountStorage(admin, U);
  await clearAccountStorage(admin, U);
});

test('a Storage remove failure is thrown, so the route can abort', async () => {
  const { admin, objects } = fakeAdmin(
    {
      vault: [`${U}/doc.pdf`],
      logos: [],
      receipts: [],
      'invoice-attachments': [`${U}/inv-1/a.jpg`],
    },
    (bucket) => bucket === 'invoice-attachments',
  );

  await assert.rejects(
    () => clearAccountStorage(admin, U),
    (error) => {
      assert.deepEqual(error, { message: 'nope' });
      return true;
    },
  );

  assert.deepEqual([...(objects.get('invoice-attachments') ?? [])], [
    `${U}/inv-1/a.jpg`,
  ]);
});

test('a Storage list failure is thrown, so the route can abort', async () => {
  const { admin } = fakeAdmin(
    {
      vault: [`${U}/doc.pdf`],
      logos: [],
      receipts: [],
      'invoice-attachments': [],
    },
    undefined,
    undefined,
    (bucket) => bucket === 'vault',
  );

  await assert.rejects(
    () => clearAccountStorage(admin, U),
    (error) => {
      assert.deepEqual(error, { message: 'list nope' });
      return true;
    },
  );
});

test('a silent remove that leaves a nested file is detected', async () => {
  const { admin, objects } = fakeAdmin(
    {
      vault: [],
      logos: [],
      receipts: [],
      'invoice-attachments': [`${U}/inv-1/a.jpg`],
    },
    undefined,
    (bucket) => bucket === 'invoice-attachments',
  );

  await assert.rejects(
    () => clearAccountStorage(admin, U),
    /Storage cleanup left objects in invoice-attachments\/1f58b401-e1b1-41e9-b11f-df5530872007\/inv-1\/a\.jpg/,
  );

  assert.deepEqual([...(objects.get('invoice-attachments') ?? [])], [
    `${U}/inv-1/a.jpg`,
  ]);
});

test('stops before recursing past the depth cap', async () => {
  const { admin } = fakeAdmin({
    vault: [],
    logos: [],
    receipts: [],
    'invoice-attachments': [
      `${U}/d1/d2/d3/d4/d5/d6/d7/d8/a.jpg`,
    ],
  });

  await assert.rejects(
    () => clearAccountStorage(admin, U),
    /nests deeper than 6/,
  );
});

test('account deletion covers every user-file bucket', () => {
  assert.deepEqual([...ACCOUNT_STORAGE_BUCKETS].sort(), [
    'invoice-attachments',
    'logos',
    'receipts',
    'vault',
  ]);
});
