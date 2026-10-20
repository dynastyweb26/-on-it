// Account-deletion Storage cleanup.
//
// Supabase Storage objects do not cascade from auth.users or public tables, so
// every bucket that holds user files must be emptied explicitly before the auth
// user is deleted. Most buckets are flat (${user_id}/file), but invoice
// attachments are nested (${user_id}/${invoice_id}/${uuid}.jpg). list() only
// returns one level, so the clearer walks folders recursively.
//
// Every failure is thrown. The route aborts before the irreversible auth delete,
// leaving the account intact and the operation retriable.

/** Buckets that contain per-user objects. Keep in sync with every upload path. */
export const ACCOUNT_STORAGE_BUCKETS = [
  'vault',
  'logos',
  'receipts',
  'invoice-attachments',
] as const;

type StorageEntry = {
  /** Supabase returns null for folders. */
  id: string | null;
  name: string;
};

/** The small slice of the service-role client this module needs. */
export type AccountStorageAdmin = {
  storage: {
    from(bucket: string): {
      list(
        path: string,
        options?: { limit?: number; offset?: number },
      ): PromiseLike<{ data: StorageEntry[] | null; error: unknown }>;
      remove(paths: string[]): PromiseLike<{ error: unknown }>;
    };
  };
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 100;
const REMOVE_BATCH = 100;
const MAX_DEPTH = 6;

export function assertUserId(userId: unknown): asserts userId is string {
  if (typeof userId !== 'string' || !UUID_RE.test(userId)) {
    throw new Error('account-storage: userId must be a valid UUID');
  }
}

/** Never let a remove() call escape the user's root folder. */
function assertInsideRoot(path: string, root: string): void {
  if (!path.startsWith(`${root}/`) || path.split('/').includes('..')) {
    throw new Error(`account-storage: refusing out-of-prefix path in ${path}`);
  }
}

async function listLevel(
  admin: AccountStorageAdmin,
  bucket: string,
  prefix: string,
): Promise<{ files: string[]; folders: string[] }> {
  const files: string[] = [];
  const folders: string[] = [];

  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, {
      limit: PAGE,
      offset,
    });
    if (error) throw error;
    if (!data?.length) break;

    for (const entry of data) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id == null) folders.push(path);
      else files.push(path);
    }

    if (data.length < PAGE) break;
  }

  return { files, folders };
}

async function removeFiles(
  admin: AccountStorageAdmin,
  bucket: string,
  paths: string[],
  root: string,
): Promise<void> {
  for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
    const chunk = paths.slice(i, i + REMOVE_BATCH);
    for (const path of chunk) assertInsideRoot(path, root);
    const { error } = await admin.storage.from(bucket).remove(chunk);
    if (error) throw error;
  }
}

async function clearPrefix(
  admin: AccountStorageAdmin,
  bucket: string,
  prefix: string,
  root = prefix,
  depth = 0,
): Promise<void> {
  if (depth > MAX_DEPTH) {
    throw new Error(
      `account-storage: ${bucket}/${prefix} nests deeper than ${MAX_DEPTH}`,
    );
  }

  const { files, folders } = await listLevel(admin, bucket, prefix);
  await removeFiles(admin, bucket, files, root);
  for (const folder of folders) {
    assertInsideRoot(folder, root);
    await clearPrefix(admin, bucket, folder, root, depth + 1);
  }
}

/** Return the first object still under `prefix`, or null when it is empty. */
async function findRemainingPath(
  admin: AccountStorageAdmin,
  bucket: string,
  prefix: string,
  depth = 0,
): Promise<string | null> {
  if (depth > MAX_DEPTH) {
    throw new Error(
      `account-storage: ${bucket}/${prefix} nests deeper than ${MAX_DEPTH}`,
    );
  }

  const { files, folders } = await listLevel(admin, bucket, prefix);
  const firstFile = files[0];
  if (firstFile) return firstFile;

  for (const folder of folders) {
    const remaining = await findRemainingPath(admin, bucket, folder, depth + 1);
    if (remaining) return remaining;
  }
  return null;
}

/** Empty every per-user object in every bucket. Throws on the first failure. */
export async function clearAccountStorage(
  admin: AccountStorageAdmin,
  userId: string,
): Promise<void> {
  assertUserId(userId);

  for (const bucket of ACCOUNT_STORAGE_BUCKETS) {
    await clearPrefix(admin, bucket, userId);

    // A remove() can resolve without deleting anything (silent no-op). Verify
    // the prefix is actually empty before moving on, so the route aborts before
    // the audit scrub and the irreversible auth delete.
    const remaining = await findRemainingPath(admin, bucket, userId);
    if (remaining) {
      throw new Error(`Storage cleanup left objects in ${bucket}/${remaining}`);
    }
  }
}
