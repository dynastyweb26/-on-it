// Tests for the account-deletion storage walk, against an in-memory fake that
// mimics Storage's one-level listing (folders come back with id === null).
import test from 'node:test';
import assert from 'node:assert/strict';
import { clearBucketFolder, type StorageLike } from './account-storage';

const U = '1f58b401-e1b1-41e9-b11f-df5530872007';
const OTHER = '2a58b401-e1b1-41e9-b11f-df5530872008';

/** Fake bucket store: a flat set of object paths per bucket. */
function fake(initial: Record<string, string[]>, opts: { failRemove?: boolean; failList?: boolean; keepOnRemove?: boolean } = {}) {
  const buckets = new Map(Object.entries(initial).map(([b, p]) => [b, new Set(p)]));
  const removed: string[][] = [];
  const storage: StorageLike = {
    from(bucket) {
      const set = buckets.get(bucket) ?? new Set<string>();
      return {
        async list(path, { limit, offset }) {
          if (opts.failList) return { data: null, error: { message: 'list boom' } };
          const pre = `${path}/`;
          const seen = new Map<string, string | null>();
          for (const p of [...set].sort()) {
            if (!p.startsWith(pre)) continue;
            const rest = p.slice(pre.length);
            const slash = rest.indexOf('/');
            if (slash === -1) seen.set(rest, 'id');
            else seen.set(rest.slice(0, slash), seen.get(rest.slice(0, slash)) ?? null);
          }
          const entries = [...seen].sort(([a], [b]) => (a < b ? -1 : 1)).map(([name, id]) => ({ name, id }));
          return { data: entries.slice(offset, offset + limit), error: null };
        },
        async remove(paths) {
          if (opts.failRemove) return { data: null, error: { message: 'remove boom' } };
          removed.push(paths);
          if (!opts.keepOnRemove) for (const p of paths) set.delete(p);
          return { data: paths, error: null };
        },
      };
    },
  };
  return { storage, buckets, removed };
}

test('clears a flat bucket', async () => {
  const f = fake({ vault: [`${U}/a.pdf`, `${U}/b.pdf`, `${OTHER}/keep.pdf`] });
  await clearBucketFolder(f.storage, 'vault', U);
  assert.deepEqual([...f.buckets.get('vault')!], [`${OTHER}/keep.pdf`]);
});

test('clears nested invoice folders (the invoice-attachments layout)', async () => {
  const f = fake({
    'invoice-attachments': [`${U}/inv1/a.jpg`, `${U}/inv1/b.jpg`, `${U}/inv2/c.jpg`, `${OTHER}/inv9/z.jpg`],
  });
  await clearBucketFolder(f.storage, 'invoice-attachments', U);
  assert.deepEqual([...f.buckets.get('invoice-attachments')!], [`${OTHER}/inv9/z.jpg`]);
});

test('removes .emptyFolderPlaceholder objects too', async () => {
  const f = fake({ 'invoice-attachments': [`${U}/inv1/.emptyFolderPlaceholder`, `${U}/inv1/a.jpg`] });
  await clearBucketFolder(f.storage, 'invoice-attachments', U);
  assert.equal(f.buckets.get('invoice-attachments')!.size, 0);
});

test('more than 100 entries at a nested level are all removed', async () => {
  const paths = Array.from({ length: 250 }, (_, i) => `${U}/inv1/${String(i).padStart(4, '0')}.jpg`);
  const f = fake({ 'invoice-attachments': paths });
  await clearBucketFolder(f.storage, 'invoice-attachments', U);
  assert.equal(f.buckets.get('invoice-attachments')!.size, 0);
  assert.ok(f.removed.every((chunk) => chunk.length <= 100));
  assert.equal(f.removed.flat().length, 250);
});

test('never removes a path outside the user prefix', async () => {
  const f = fake({ 'invoice-attachments': [`${U}/inv1/a.jpg`, `${OTHER}/inv1/b.jpg`, `${U}x/inv1/c.jpg`] });
  await clearBucketFolder(f.storage, 'invoice-attachments', U);
  for (const p of f.removed.flat()) assert.ok(p.startsWith(`${U}/`), p);
  assert.ok(f.buckets.get('invoice-attachments')!.has(`${OTHER}/inv1/b.jpg`));
});

test('empty, undefined and non-UUID user ids throw before touching storage', async () => {
  const f = fake({ vault: [`${U}/a.pdf`] });
  for (const bad of ['', undefined, null, 'abc', '../', `${U}/..`, '*'] as unknown[]) {
    await assert.rejects(() => clearBucketFolder(f.storage, 'vault', bad as string), /valid UUID/);
  }
  assert.equal(f.removed.length, 0);
  assert.equal(f.buckets.get('vault')!.size, 1);
});

test('an empty folder is a no-op', async () => {
  const f = fake({ receipts: [] });
  await clearBucketFolder(f.storage, 'receipts', U);
  assert.equal(f.removed.length, 0);
});

test('list and remove errors propagate', async () => {
  await assert.rejects(() => clearBucketFolder(fake({ vault: [`${U}/a`] }, { failList: true }).storage, 'vault', U), /list boom/);
  await assert.rejects(() => clearBucketFolder(fake({ vault: [`${U}/a`] }, { failRemove: true }).storage, 'vault', U), /remove boom/);
});

test('throws if objects remain after the clear (nothing ignored silently)', async () => {
  const f = fake({ vault: [`${U}/a.pdf`] }, { keepOnRemove: true });
  await assert.rejects(() => clearBucketFolder(f.storage, 'vault', U), /remain/);
});
