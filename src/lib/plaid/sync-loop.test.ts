// ═══ Plaid transactions/sync pagination loop ═══
// The cursor contract: rows commit BEFORE the cursor moves, and a
// mutation-during-pagination restarts from the saved cursor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isItemLoginError, isPaginationMutation, runSyncPages, type SyncPage } from './sync-loop';

type Txn = { transaction_id: string };
const page = (ids: string[], nextCursor: string, hasMore: boolean): SyncPage<Txn> => ({
  added: ids.map((transaction_id) => ({ transaction_id })),
  modified: [],
  removed: [],
  nextCursor,
  hasMore,
});

const mutation = () => Object.assign(new Error('changed'), {
  error_code: 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION',
});

test('writes rows before saving the cursor', async () => {
  const log: string[] = [];
  const result = await runSyncPages<Txn, string[]>({
    startCursor: null,
    fetchPage: async (cursor) => {
      log.push(`fetch:${cursor ?? 'start'}`);
      return page(['a', 'b'], 'cursor-1', false);
    },
    planPage: (p) => p.added.map((t) => t.transaction_id),
    commitPage: async (ids) => {
      log.push(`commit:${ids.join(',')}`);
    },
    saveCursor: async (cursor) => {
      log.push(`cursor:${cursor}`);
    },
    isPaginationMutation,
  });

  assert.deepEqual(log, ['fetch:start', 'commit:a,b', 'cursor:cursor-1']);
  assert.equal(result.pages, 1);
  assert.equal(result.cursor, 'cursor-1');
});

test('a failed commit does not move the cursor', async () => {
  const log: string[] = [];
  await assert.rejects(
    runSyncPages<Txn, string[]>({
      startCursor: 'saved',
      fetchPage: async () => page(['a'], 'cursor-1', false),
      planPage: (p) => p.added.map((t) => t.transaction_id),
      commitPage: async () => {
        throw new Error('db down');
      },
      saveCursor: async (cursor) => {
        log.push(`cursor:${cursor}`);
      },
      isPaginationMutation,
    }),
    /db down/,
  );
  assert.deepEqual(log, []);
});

test('mutation during pagination restarts from the saved cursor', async () => {
  const fetches: (string | null)[] = [];
  let attempts = 0;
  const result = await runSyncPages<Txn, string[]>({
    startCursor: 'saved',
    fetchPage: async (cursor) => {
      fetches.push(cursor);
      attempts++;
      if (attempts === 1) throw mutation();
      return page(['a'], 'next', false);
    },
    planPage: (p) => p.added.map((t) => t.transaction_id),
    commitPage: async () => {},
    saveCursor: async () => {},
    isPaginationMutation,
  });

  assert.deepEqual(fetches, ['saved', 'saved']);
  assert.equal(result.restarts, 1);
  assert.equal(result.cursor, 'next');
});

test('restarts are bounded so a broken item cannot loop forever', async () => {
  let fetches = 0;
  await assert.rejects(
    runSyncPages<Txn, string[]>({
      startCursor: 'saved',
      fetchPage: async () => {
        fetches++;
        throw mutation();
      },
      planPage: () => [],
      commitPage: async () => {},
      saveCursor: async () => {},
      isPaginationMutation,
      maxRestarts: 2,
    }),
    /changed/,
  );
  assert.equal(fetches, 3); // first try + two restarts
});

test('multiple pages each commit, then save their own cursor', async () => {
  const log: string[] = [];
  let n = 0;
  const result = await runSyncPages<Txn, string[]>({
    startCursor: null,
    fetchPage: async (cursor) => {
      n++;
      log.push(`fetch:${cursor ?? 'start'}`);
      return n === 1 ? page(['a'], 'c1', true) : page(['b'], 'c2', false);
    },
    planPage: (p) => p.added.map((t) => t.transaction_id),
    commitPage: async (ids) => { log.push(`commit:${ids[0]}`); },
    saveCursor: async (cursor) => { log.push(`cursor:${cursor}`); },
    isPaginationMutation,
  });

  assert.deepEqual(log, ['fetch:start', 'commit:a', 'cursor:c1', 'fetch:c1', 'commit:b', 'cursor:c2']);
  assert.equal(result.pages, 2);
  assert.equal(result.moreRemaining, false);
});

test('the page cap stops a long run without losing the cursor', async () => {
  let n = 0;
  const result = await runSyncPages<Txn, string[]>({
    startCursor: null,
    fetchPage: async () => {
      n++;
      return page([], `c${n}`, true);
    },
    planPage: () => [],
    commitPage: async () => {},
    saveCursor: async () => {},
    isPaginationMutation,
    maxPages: 3,
  });
  assert.equal(result.pages, 3);
  assert.equal(result.cursor, 'c3');
  assert.equal(result.moreRemaining, true);
});

test('only Plaid’s mutation code restarts, and item errors ask for a re-login', () => {
  assert.equal(isPaginationMutation(mutation()), true);
  assert.equal(isPaginationMutation({ error_code: 'RATE_LIMIT_EXCEEDED' }), false);
  assert.equal(isPaginationMutation(new Error('boom')), false);

  assert.equal(isItemLoginError({ error_code: 'ITEM_LOGIN_REQUIRED' }), true);
  assert.equal(isItemLoginError({ error_code: 'PENDING_EXPIRATION' }), true);
  assert.equal(isItemLoginError({ error_type: 'ITEM_ERROR' }), true);
  assert.equal(isItemLoginError({ error_code: 'INSTITUTION_NOT_RESPONDING' }), false);
});
