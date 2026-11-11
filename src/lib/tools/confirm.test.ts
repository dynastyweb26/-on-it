// The confirm scaffold is the difference between "the model proposed a write"
// and "a write happened". These tests are the proof: no token, no write; one
// key, one row; several tokens, one request.
import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { buildRegistry, defineTool, type ToolDb } from './contract';
import {
  CONFIRM_TOKEN_TTL_MS,
  confirmActions,
  createPendingAction,
  sameTokenHash,
} from './confirm';
import { fixturePendingStore } from './pending-fixture';
import { fixtureDb } from './fixture-db';

const OWNER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';

/** Every execution records one row in a fake table, so "wrote once" is countable. */
function writeCount() {
  return { rows: 0 };
}

function writeTool(rows: { rows: number }) {
  return defineTool({
    name: 'record_payment',
    description: 'Record a payment against an invoice. Writes one row.',
    input: z.object({ invoice_id: z.string().min(1), amount: z.number().positive() }).strict(),
    output: z.object({ invoice_id: z.string(), recorded: z.number().int() }),
    type: 'write',
    risk: 'high',
    defaultTemplate: { id: 'payment_card', props: z.object({ invoice_id: z.string() }) },
    handler: async (_ctx, args) => {
      rows.rows += 1;
      return { invoice_id: args.invoice_id, recorded: rows.rows };
    },
    fixture: { args: { invoice_id: 'inv-1', amount: 50 }, result: { invoice_id: 'inv-1', recorded: 1 } },
  });
}

const registryFor = (rows: { rows: number }) => buildRegistry([writeTool(rows)]);
const db: ToolDb = fixtureDb({});

test('a write tool cannot run without a token: the proposal only records an action', async () => {
  const rows = writeCount();
  const store = fixturePendingStore();
  const created = await createPendingAction({
    userId: OWNER,
    tool: 'record_payment',
    args: { invoice_id: 'inv-1', amount: 50 },
    store,
  });

  assert.equal(rows.rows, 0, 'nothing written by the proposal');
  assert.ok(created.token.length >= 32);
  // The token is never stored in the clear.
  assert.equal(store.actions.size, 1);
  const stored = [...store.actions.values()][0];
  assert.equal(stored.tokenHash.length, 64);
  assert.notEqual(stored.tokenHash, created.token);
});

test('a confirmed action executes once and replaying its token is refused', async () => {
  const rows = writeCount();
  const store = fixturePendingStore();
  const registry = registryFor(rows);
  const { token } = await createPendingAction({
    userId: OWNER, tool: 'record_payment', args: { invoice_id: 'inv-1', amount: 50 }, store,
  });

  const first = await confirmActions({
    userId: OWNER, tokens: [token], store, registry, db,
  });
  assert.equal(first.ok, true);
  assert.equal(rows.rows, 1);

  const second = await confirmActions({
    userId: OWNER, tokens: [token], store, registry, db,
  });
  assert.deepEqual(second, { ok: false, reason: 'already_confirmed' });
  assert.equal(rows.rows, 1, 'still one row');
});

test('a replayed idempotency key writes one row and returns the first result', async () => {
  const rows = writeCount();
  const store = fixturePendingStore();
  const registry = registryFor(rows);
  const { token } = await createPendingAction({
    userId: OWNER, tool: 'record_payment', args: { invoice_id: 'inv-1', amount: 50 }, store,
  });

  const first = await confirmActions({
    userId: OWNER, tokens: [token], idempotencyKey: 'tap-abc-123', store, registry, db,
  });
  assert.equal(first.ok, true);
  if (first.ok) assert.equal(first.replayed, false);

  // A second request with a NEW token but the same key (a retry after a
  // timeout) must not write again.
  const again = await createPendingAction({
    userId: OWNER, tool: 'record_payment', args: { invoice_id: 'inv-1', amount: 50 }, store,
  });
  const replay = await confirmActions({
    userId: OWNER, tokens: [again.token], idempotencyKey: 'tap-abc-123', store, registry, db,
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

  const a = await createPendingAction({
    userId: OWNER, tool: 'record_payment', args: { invoice_id: 'inv-a', amount: 25 }, store,
  });
  const b = await createPendingAction({
    userId: OWNER, tool: 'record_payment', args: { invoice_id: 'inv-b', amount: 30 }, store,
  });

  const result = await confirmActions({
    userId: OWNER, tokens: [a.token, b.token], idempotencyKey: 'batch-1', store, registry, db,
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
  const good = await createPendingAction({
    userId: OWNER, tool: 'record_payment', args: { invoice_id: 'inv-a', amount: 25 }, store,
  });

  const result = await confirmActions({
    userId: OWNER, tokens: [good.token, 'not-a-real-token'], store, registry, db,
  });
  assert.deepEqual(result, { ok: false, reason: 'unknown_token' });
  assert.equal(rows.rows, 0, 'all-or-nothing: the good action did not run');
});

test('an expired token is refused', async () => {
  const rows = writeCount();
  const store = fixturePendingStore();
  const registry = registryFor(rows);
  const created = await createPendingAction({
    userId: OWNER, tool: 'record_payment', args: { invoice_id: 'inv-1', amount: 50 }, store,
  });

  const later = new Date(Date.now() + CONFIRM_TOKEN_TTL_MS + 1000);
  const result = await confirmActions({
    userId: OWNER, tokens: [created.token], store, registry, db, now: later,
  });
  assert.deepEqual(result, { ok: false, reason: 'expired_token' });
  assert.equal(rows.rows, 0);
});

test("another user's token is unknown, not theirs to confirm", async () => {
  const rows = writeCount();
  const store = fixturePendingStore();
  const registry = registryFor(rows);
  const created = await createPendingAction({
    userId: OWNER, tool: 'record_payment', args: { invoice_id: 'inv-1', amount: 50 }, store,
  });

  const result = await confirmActions({
    userId: OTHER, tokens: [created.token], store, registry, db,
  });
  assert.deepEqual(result, { ok: false, reason: 'unknown_token' });
  assert.equal(rows.rows, 0);
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
    defaultTemplate: { id: 'lookup_card', props: z.object({ ok: z.boolean() }) },
    handler: async () => ({ ok: true }),
    fixture: { args: {}, result: { ok: true } },
  });
  const registry = buildRegistry([readOnly]);
  const created = await createPendingAction({
    userId: OWNER, tool: 'lookup', args: {}, store,
  });

  const result = await confirmActions({
    userId: OWNER, tokens: [created.token], store, registry, db,
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
