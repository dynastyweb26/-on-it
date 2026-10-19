// Storage cleanup for account deletion. Every user file lives under
// `${userId}/` in a private/public bucket and none of it cascades from an
// auth-user delete. Some buckets are flat (`${user}/${file}`), others nest
// (`${user}/${invoice}/${file}`); Storage lists one level at a time and returns
// sub-folders as entries with `id === null`, so the walk must recurse — a
// remove() on a folder path deletes nothing and reports no error.
//
// Kept free of server imports so it can be unit-tested with a fake client.

export type StorageEntry = { name: string; id: string | null };
type ListResult = { data: StorageEntry[] | null; error: { message: string } | null };
type RemoveResult = { data: unknown; error: { message: string } | null };

/** The slice of `supabase.storage` this module uses. */
export interface StorageLike {
  from(bucket: string): {
    list(path: string, opts: { limit: number; offset: number; sortBy: { column: string; order: string } }): PromiseLike<ListResult>;
    remove(paths: string[]): PromiseLike<RemoveResult>;
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 100;
const MAX_DEPTH = 6;

export function assertUserId(userId: unknown): asserts userId is string {
  if (typeof userId !== 'string' || !UUID_RE.test(userId)) {
    throw new Error('account-storage: userId must be a valid UUID');
  }
}

/** Every object path under `prefix` (folders are descended, not returned).
 *  Pure listing with offset pagination — nothing is removed while this runs,
 *  so the offsets stay stable. `.emptyFolderPlaceholder` is a real object and
 *  is returned like any other so removing it lets the folder disappear. */
async function collectLeafPaths(
  storage: StorageLike, bucket: string, prefix: string, depth = 0,
): Promise<string[]> {
  if (depth > MAX_DEPTH) throw new Error(`account-storage: ${bucket}/${prefix} nests deeper than ${MAX_DEPTH}`);
  const out: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await storage.from(bucket).list(prefix, {
      limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw new Error(`account-storage: list ${bucket}/${prefix}: ${error.message}`);
    if (!data?.length) break;
    for (const entry of data) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id === null) out.push(...(await collectLeafPaths(storage, bucket, path, depth + 1)));
      else out.push(path);
    }
    if (data.length < PAGE) break;
  }
  return out;
}

/** Remove everything under `${userId}/` in one bucket, then re-list and throw
 *  if anything is still there. Throws on any error so the caller can abort
 *  before the irreversible auth-user delete. */
export async function clearBucketFolder(storage: StorageLike, bucket: string, userId: string): Promise<void> {
  assertUserId(userId);
  const root = userId;
  const paths = await collectLeafPaths(storage, bucket, root);

  // Hard guard: never hand remove() a path outside this user's folder.
  for (const p of paths) {
    if (!p.startsWith(`${root}/`)) throw new Error(`account-storage: refusing out-of-prefix path in ${bucket}`);
  }

  for (let i = 0; i < paths.length; i += PAGE) {
    const { error } = await storage.from(bucket).remove(paths.slice(i, i + PAGE));
    if (error) throw new Error(`account-storage: remove ${bucket}: ${error.message}`);
  }

  const left = await collectLeafPaths(storage, bucket, root);
  if (left.length) throw new Error(`account-storage: ${left.length} object(s) remain in ${bucket} after clearing`);
}
