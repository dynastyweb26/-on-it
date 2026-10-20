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
    vault: ['u/doc.pdf', 'u/nested/deep.pdf'],
    logos: ['u/logo.png'],
    receipts: ['u/receipt-hash.jpg'],
    'invoice-attachments': [
      'u/inv-1/a.jpg',
      'u/inv-1/b.jpg',
      'u/inv-2/c.jpg',
      'other-user/inv-9/keep.jpg',
    ],
  });

  await clearAccountStorage(admin, 'u');

  for (const bucket of ACCOUNT_STORAGE_BUCKETS) {
    const left = [...(objects.get(bucket) ?? [])].filter((path) => path.startsWith('u/'));
    assert.deepEqual(left, [], `${bucket} still has user objects`);

    const listed = await admin.storage.from(bucket).list('u');
    assert.deepEqual(listed.data, [], `${bucket} still lists user objects`);
  }

  assert.deepEqual(
    [...(objects.get('invoice-attachments') ?? [])],
    ['other-user/inv-9/keep.jpg'],
  );
});

test('walks a folder listed alongside a file at the same level', async () => {
  const { admin, objects, calls } = fakeAdmin({
    vault: [],
    logos: [],
    receipts: [],
    'invoice-attachments': ['u/top.txt', 'u/inv-1/nested.txt'],
  });

  await clearAccountStorage(admin, 'u');

  assert.deepEqual([...(objects.get('invoice-attachments') ?? [])], []);
  assert.ok(calls.includes('list:invoice-attachments:u'));
  assert.ok(calls.includes('list:invoice-attachments:u/inv-1'));
  assert.ok(calls.includes('remove:invoice-attachments:1'));
});

test('account deletion is idempotent when the user has no objects', async () => {
  const { admin } = fakeAdmin({
    vault: [],
    logos: [],
    receipts: [],
    'invoice-attachments': [],
  });

  await clearAccountStorage(admin, 'u');
  await clearAccountStorage(admin, 'u');
});

test('a Storage remove failure is thrown, so the route can abort', async () => {
  const { admin, objects } = fakeAdmin(
    {
      vault: ['u/doc.pdf'],
      logos: [],
      receipts: [],
      'invoice-attachments': ['u/inv-1/a.jpg'],
    },
    (bucket) => bucket === 'invoice-attachments',
  );

  await assert.rejects(
    () => clearAccountStorage(admin, 'u'),
    (error) => {
      assert.deepEqual(error, { message: 'nope' });
      return true;
    },
  );

  assert.deepEqual([...(objects.get('invoice-attachments') ?? [])], ['u/inv-1/a.jpg']);
});
