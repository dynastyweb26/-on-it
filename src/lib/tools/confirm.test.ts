// The confirm scaffold is the difference between "the model proposed a write"
// and "a write happened". These tests are the proof: no token, no write; one
// key, one row; several tokens, one request; an execute that finds the world
// changed refuses instead of writing anyway.
import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { buildRegistry, defineTool, defineWriteTool, type WriteContext } from './contract';
import {
  ALREADY_CONFIRMED_PROBLEM,
  EXECUTE_FAILED_PROBLEM,
  CONFIRM_TOKEN_TTL_MS,
  confirmActions,
  confirmSentence,
  createPendingAction,
  sameTokenHash,
} from './confirm';
import { fixturePendingStore, type FixturePendingStore } from './pending-fixture';
import { fixtureWriteDb } from './write-fixture';
import { ConfirmBatchProps } from '@/lib/templates/props';

const OWNER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';

/** Every execution records one row in a fake table, so "wrote once" is countable. */
function writeCount() {
  return { rows: 0 };
}

function writeTool(counter: { rows: number }) {
  return defineWriteTool({
    name: 'record_payment',
    description: 'Record a payment against an invoice. Writes one row.',
    input: z.object({ invoice_id: z.string().min(1), amount: z.number().positive() }).strict(),
    output: z.object({ invoice_id: z.string(), recorded: z.number().int() }),
    type: 'write',
    risk: 'high',
    defaultTemplate: { id: 'confirm.batch', props: ConfirmBatchProps },
    prepare: async (_ctx, args) => ({
      ok: true,
      resolved: { invoice_id: args.invoice_id, amount: args.amount },
      row: { icon: 'card', summary: `Record a payment for ${args.invoice_id}`, amount: '', tone: 'in' },
    }),
    execute: async (ctx, resolved) => {
      const { invoice_id, amount } = resolved as { invoice_id: string; amount: number };
      const { error } = await ctx.db.insert('invoice_payments', {
        id: `pay-${counter.rows + 1}`,
        invoice_id,
        amount,
        user_id: ctx.userId,
      });
      if (error) return { ok: false, problem: 'I could not record that payment.' };
      counter.rows += 1;
      return { ok: true, result: { invoice_id, recorded: counter.rows } };
    },
    fallback: () => 'Payment recorded.',
    fixture: { args: { invoice_id: 'inv-1', amount: 50 }, result: { invoice_id: 'inv-1', recorded: 1 } },
    preview: {
      resolved: { invoice_id: 'inv-1', amount: 50 },
      row: { icon: 'card', summary: 'Record a payment for inv-1', amount: '', tone: 'in' },
    },
  });
}

const registryFor = (counter: { rows: number }) => buildRegistry([writeTool(counter)]);
const wctxFor = (userId = OWNER): WriteContext => ({ db: fixtureWriteDb({}, userId), userId });

test('a write tool cannot run without a token: the proposal only records an action', async () => {
  const rows = writeCount();
  const store = fixturePendingStore();
  const created = await createPendingAction({
    userId: OWNER,
    tool: 'record_payment',
    resolved: { invoice_id: 'inv-1', amount: 50 },
    store,
  });

  assert.equal(rows.rows, 0, 'nothing written by the proposal');
  assert.ok(created.token.length >= 32);
  // The token is never stored in the clear.
  assert.equal(store.actions.size, 1);
  const stored = [...store.actions.values()][0];
  assert.equal(stored.tokenHash.length, 64);
  assert.notEqual(stored.tokenHash, created.token);
  // What is stored is resolved ids, never the model's raw arguments.
  assert.deepEqual(stored.resolved, { invoice_id: 'inv-1', amount: 50 });
});

test('a confirmed action executes once and replaying its token is refused', async () => {
  const rows = writeCount();
  const store = fixturePendingStore();
  const registry = registryFor(rows);
  const wctx = wctxFor();
  const { token } = await createPendingAction({
    userId: OWNER, tool: 'record_payment', resolved: { invoice_id: 'inv-1', amount: 50 }, store,
  });

  const first = await confirmActions({ userId: OWNER, tokens: [token], store, registry, wctx });
  assert.equal(first.ok, true);
  assert.equal(rows.rows, 1);

  const second = await confirmActions({ userId: OWNER, tokens: [token], store, registry, wctx });
  assert.deepEqual(second, { ok: false, reason: 'already_confirmed' });
  assert.equal(rows.rows, 1, 'still one row');
});

test('a replayed idempotency key writes one row and returns the first result', async () => {
  const rows = writeCount();
  const store = fixturePendingStore();
  const registry = registryFor(rows);
  const wctx = wctxFor();
  const { token } = await createPendingAction({
    userId: OWNER, tool: 'record_payment', resolved: { invoice_id: 'inv-1', amount: 50 }, store,
  });

  const first = await confirmActions({
    userId: OWNER, tokens: [token], idempotencyKey: 'tap-abc-123', store, registry, wctx,
  });
  assert.equal(first.ok, true);
  if (first.ok) assert.equal(first.replayed, false);

  // A second request with a NEW token but the same key (a retry after a
  // timeout) must not write again.
  const again = await createPendingAction({
    userId: OWNER, tool: 'record_payment', resolved: { invoice_id: 'inv-1', amount: 50 }, store,
  });
  const replay = await confirmActions({
    userId: OWNER, tokens: [again.token], idempotencyKey: 'tap-abc-123', store, registry, wctx,
  });

  assert.equal(replay.ok, true);
  if (replay.ok) {
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.actions, first.ok ? first.actions : []);
  }
  assert.equal(rows.rows, 1, 'the replay wrote nothing');
});

test('several pending actions are confirmed together in one request', async () => {
  const rows = writeCount();
  const store = fixturePendingStore();
  const registry = registryFor(rows);
  const wctx = wctxFor();

  const a = await createPendingAction({
    userId: OWNER, tool: 'record_payment', resolved: { invoice_id: 'inv-a', amount: 25 }, store,
  });
  const b = await createPendingAction({
    userId: OWNER, tool: 'record_payment', resolved: { invoice_id: 'inv-b', amount: 30 }, store,
  });

  const result = await confirmActions({
    userId: OWNER, tokens: [a.token, b.token], idempotencyKey: 'batch-1', store, registry, wctx,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.actions.map((x) => x.tool), ['record_payment', 'record_payment']);
    assert.equal(result.actions.length, 2);
  }
  assert.equal(rows.rows, 2);
});

test('one bad token in a batch executes nothing', async () => {
  const rows = writeCount();
  const store = fixturePendingStore();
  const registry = registryFor(rows);
  const wctx = wctxFor();
  const good = await createPendingAction({
    userId: OWNER, tool: 'record_payment', resolved: { invoice_id: 'inv-a', amount: 25 }, store,
  });

  const result = await confirmActions({
    userId: OWNER, tokens: [good.token, 'not-a-real-token'], store, registry, wctx,
  });
  assert.deepEqual(result, { ok: false, reason: 'unknown_token' });
  assert.equal(rows.rows, 0, 'all-or-nothing: the good action did not run');
});

test('an expired token is refused', async () => {
  const rows = writeCount();
  const store = fixturePendingStore();
  const registry = registryFor(rows);
  const created = await createPendingAction({
    userId: OWNER, tool: 'record_payment', resolved: { invoice_id: 'inv-1', amount: 50 }, store,
  });

  const later = new Date(Date.now() + CONFIRM_TOKEN_TTL_MS + 1000);
  const result = await confirmActions({
    userId: OWNER, tokens: [created.token], store, registry, wctx: wctxFor(), now: later,
  });
  assert.deepEqual(result, { ok: false, reason: 'expired_token' });
  assert.equal(rows.rows, 0);
});

test("another user's token is unknown, not theirs to confirm", async () => {
  const rows = writeCount();
  const store = fixturePendingStore();
  const registry = registryFor(rows);
  const created = await createPendingAction({
    userId: OWNER, tool: 'record_payment', resolved: { invoice_id: 'inv-1', amount: 50 }, store,
  });

  const result = await confirmActions({
    userId: OTHER, tokens: [created.token], store, registry, wctx: wctxFor(OTHER),
  });
  assert.deepEqual(result, { ok: false, reason: 'unknown_token' });
  assert.equal(rows.rows, 0);
});

test('execute refuses when the state moved after prepare, and writes nothing', async () => {
  const rows = writeCount();
  const store = fixturePendingStore();
  const registry = registryFor(rows);
  const wctx = wctxFor();
  const created = await createPendingAction({
    userId: OWNER, tool: 'record_payment', resolved: { invoice_id: 'inv-1', amount: 50 }, store,
  });

  // The world changes between the proposal and the confirm.
  const tool = registry.get('record_payment');
  const changed = { ...tool, execute: async () => ({ ok: false as const, problem: 'That invoice was deleted.' }) };
  const changedRegistry = buildRegistry([changed as never]);

  const result = await confirmActions({
    userId: OWNER, tokens: [created.token], store, registry: changedRegistry, wctx,
  });
  assert.deepEqual(result, { ok: false, reason: 'state_changed', problem: 'That invoice was deleted.' });
  assert.equal(rows.rows, 0);
  // The claim was won and handed straight back, so a retry is possible.
  assert.deepEqual(store.releases, [store.executions[0]]);
  assert.equal([...store.actions.values()][0].executedAt, null);
});

test('the confirm sentence is composed by the server and says "ready"', () => {
  assert.equal(
    confirmSentence({ icon: 'person', summary: 'Add client Maria Santos', amount: '', tone: 'neutral' }),
    'Ready to confirm: Add client Maria Santos.',
  );
});

test('a read tool can never be confirmed into a write path', async () => {
  const rows = writeCount();
  const store = fixturePendingStore();
  const readOnly = defineTool({
    name: 'lookup',
    description: 'Look something up without changing anything at all.',
    input: z.object({}).strict(),
    output: z.object({ ok: z.boolean() }),
    type: 'read',
    risk: 'low',
    defaultTemplate: { id: 'nav.link', props: z.object({ ok: z.boolean() }) },
    handler: async () => ({ ok: true }),
    fallback: () => 'Found it.',
    fixture: { args: {}, result: { ok: true } },
  });
  const registry = buildRegistry([readOnly]);
  const created = await createPendingAction({
    userId: OWNER, tool: 'lookup', resolved: {}, store,
  });

  const result = await confirmActions({
    userId: OWNER, tokens: [created.token], store, registry, wctx: wctxFor(),
  });
  assert.deepEqual(result, { ok: false, reason: 'not_executable' });
  assert.equal(rows.rows, 0);
});

test('token hashes compare in constant time and agree on equality', () => {
  const a = 'a'.repeat(64);
  assert.equal(sameTokenHash(a, a), true);
  assert.equal(sameTokenHash(a, 'b'.repeat(64)), false);
  assert.equal(sameTokenHash(a, 'short'), false);
});

test('a later refusal does not undo the rows already saved', async () => {
  const rows = writeCount();
  const store = fixturePendingStore();
  const base = writeTool(rows);
  // One resolved id refuses as if its invoice had been deleted after prepare.
  const picky = {
    ...base,
    execute: async (ctx: Parameters<NonNullable<typeof base.execute>>[0], resolved: unknown) => {
      if ((resolved as { invoice_id: string }).invoice_id === 'inv-b') {
        return { ok: false as const, problem: 'That invoice was deleted.' };
      }
      return base.execute!(ctx, resolved);
    },
  };
  const registry = buildRegistry([picky as never]);

  const a = await createPendingAction({
    userId: OWNER, tool: 'record_payment', resolved: { invoice_id: 'inv-a', amount: 25 }, store,
  });
  const b = await createPendingAction({
    userId: OWNER, tool: 'record_payment', resolved: { invoice_id: 'inv-b', amount: 30 }, store,
  });

  const result = await confirmActions({
    userId: OWNER, tokens: [a.token, b.token], store, registry, wctx: wctxFor(),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.state, 'partial');
  assert.deepEqual(result.actions.map((action) => action.status), ['saved', 'failed']);
  const failed = result.actions[1];
  assert.equal(failed.status === 'failed' ? failed.problem : null, 'That invoice was deleted.');
  assert.equal(rows.rows, 1, 'the saved row stays saved');
});

test('two confirms that reach the claim together execute exactly once', async () => {
  const rows = writeCount();
  const base = fixturePendingStore();
  let arrivals = 0;
  let openGate: () => void = () => {};
  const gate = new Promise<void>((resolve) => { openGate = resolve; });
  const store: FixturePendingStore = {
    ...base,
    claim: async (userId, actionId) => {
      arrivals += 1;
      // Let both confirms arrive before either claim runs: the store's UPDATE is
      // what decides the winner, not the check that let them both this far.
      if (arrivals === 2) openGate();
      if (arrivals < 2) await gate;
      return base.claim(userId, actionId);
    },
  };
  const registry = registryFor(rows);
  const wctx = wctxFor();
  const { token } = await createPendingAction({
    userId: OWNER, tool: 'record_payment', resolved: { invoice_id: 'inv-1', amount: 50 }, store,
  });

  const outcomes = await Promise.all([
    confirmActions({ userId: OWNER, tokens: [token], store, registry, wctx }),
    confirmActions({ userId: OWNER, tokens: [token], store, registry, wctx }),
  ]);

  assert.equal(rows.rows, 1, 'execute ran exactly once');
  assert.equal(base.executions.length, 1, 'one claim was granted');
  assert.equal(outcomes.filter((result) => result.ok).length, 1);
  const loser = outcomes.find((result) => !result.ok);
  assert.deepEqual(loser, {
    ok: false, reason: 'already_confirmed', problem: ALREADY_CONFIRMED_PROBLEM,
  });
});

test('an execute that throws releases the claim so the owner can retry', async () => {
  const rows = writeCount();
  const store = fixturePendingStore();
  const good = registryFor(rows);
  const broken = buildRegistry([{
    ...good.get('record_payment'),
    execute: async () => { throw new Error('boom'); },
  } as never]);
  const { token } = await createPendingAction({
    userId: OWNER, tool: 'record_payment', resolved: { invoice_id: 'inv-1', amount: 50 }, store,
  });

  const failed = await confirmActions({
    userId: OWNER, tokens: [token], store, registry: broken, wctx: wctxFor(),
  });
  assert.deepEqual(failed, { ok: false, reason: 'execute_failed', problem: EXECUTE_FAILED_PROBLEM });
  assert.equal(rows.rows, 0);
  assert.deepEqual(store.releases, [store.executions[0]], 'the claim went back');

  // The same token works now that the store is released.
  const retry = await confirmActions({
    userId: OWNER, tokens: [token], store, registry: good, wctx: wctxFor(),
  });
  assert.equal(retry.ok, true);
  assert.equal(rows.rows, 1);
});
