// ═══ Plaid transactions/sync — pagination loop ═══
// The ordering contract that the cursor depends on:
//   fetch page → plan → write the rows (commit) → ONLY THEN save the cursor.
// If the row write fails, the cursor is not moved, so the next sync replays the
// page. Plaid can answer TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION when the
// item changes mid-loop; the only safe response is to restart pagination from
// the cursor that is actually saved.
//
// Pure orchestration: fetchPage / commitPage / saveCursor are injected, so the
// loop (including the commit-before-cursor order) is unit-tested with spies.

export type SyncPage<TAdded, TRemoved = TAdded> = {
  added: TAdded[];
  modified: TAdded[];
  removed: TRemoved[];
  nextCursor: string;
  hasMore: boolean;
};

export type SyncLoopDeps<TPage, TPlan, TRemoved = unknown> = {
  /** Cursor persisted on the item before this run (null on the first sync). */
  startCursor: string | null;
  fetchPage: (cursor: string | null) => Promise<SyncPage<TPage, TRemoved>>;
  planPage: (page: SyncPage<TPage, TRemoved>) => Promise<TPlan> | TPlan;
  /** Writes the page's rows. Must throw when the write did not commit. */
  commitPage: (plan: TPlan) => Promise<void>;
  /** Called only after commitPage resolved. */
  saveCursor: (cursor: string) => Promise<void>;
  /** Plaid's TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION. */
  isPaginationMutation: (error: unknown) => boolean;
  maxRestarts?: number;
  /** Bound on one run; the next webhook/manual sync continues from the cursor. */
  maxPages?: number;
};

export type SyncLoopResult = {
  pages: number;
  restarts: number;
  cursor: string | null;
  /** True when maxPages stopped the run with Plaid still holding more. */
  moreRemaining: boolean;
};

export class SyncPageLimitError extends Error {
  constructor() {
    super('transactions/sync page limit reached');
    this.name = 'SyncPageLimitError';
  }
}

export async function runSyncPages<TPage, TPlan, TRemoved = unknown>(
  deps: SyncLoopDeps<TPage, TPlan, TRemoved>,
): Promise<SyncLoopResult> {
  const maxRestarts = deps.maxRestarts ?? 3;
  const maxPages = deps.maxPages ?? 20;

  let cursor = deps.startCursor;
  let restarts = 0;
  let pages = 0;

  for (;;) {
    let page: SyncPage<TPage, TRemoved>;
    try {
      page = await deps.fetchPage(cursor);
    } catch (error) {
      if (deps.isPaginationMutation(error) && restarts < maxRestarts) {
        // Restart from the saved cursor, never from the half-applied page.
        restarts++;
        cursor = deps.startCursor;
        continue;
      }
      throw error;
    }

    const plan = await deps.planPage(page);
    await deps.commitPage(plan); // commit …
    await deps.saveCursor(page.nextCursor); // … then move the cursor
    cursor = page.nextCursor;
    pages++;

    if (!page.hasMore) {
      return { pages, restarts, cursor, moreRemaining: false };
    }
    if (pages >= maxPages) {
      return { pages, restarts, cursor, moreRemaining: true };
    }
  }
}

/** Plaid error shape the loop needs (error_code survives the client layer). */
export function isPaginationMutation(error: unknown): boolean {
  const code = (error as { error_code?: unknown } | null)?.error_code;
  return code === 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION';
}

/** Item-level errors that mean the owner must re-authenticate. */
export function isItemLoginError(error: unknown): boolean {
  const e = error as { error_code?: unknown; error_type?: unknown } | null;
  return (
    e?.error_code === 'ITEM_LOGIN_REQUIRED' ||
    e?.error_code === 'PENDING_EXPIRATION' ||
    e?.error_code === 'PENDING_DISCONNECT' ||
    e?.error_code === 'INVALID_ACCESS_TOKEN' ||
    e?.error_type === 'ITEM_ERROR'
  );
}
