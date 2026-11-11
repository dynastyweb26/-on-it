// One submission, one row. The fake IO behaves like the database: a duplicate
// (user_id, idempotency_key) is refused by the partial unique index, and the
// route's adapter reads the original back instead of writing a second row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isDifferentUnattachedPayment,
  saveUnattachedPaymentOnce,
  unattachedInsertRow,
  unattachedPaymentKey,
  type UnattachedPaymentIO,
  type UnattachedPaymentRow,
} from './unattached-payment';

type Stored = UnattachedPaymentRow & { user_id: string };

const input = {
  amount: 120,
  method: 'zelle' as const,
  received_on: '2026-11-11',
  title: 'Side job',
};
const KEY = unattachedPaymentKey('submission-1');
const ROW = unattachedInsertRow('user-a', input, KEY);

/** A store with the real rule: one live row per (user_id, key). */
function memory() {
  const rows: Stored[] = [];
  const io: UnattachedPaymentIO = {
    insertOnce: async (pending) => {
      const existing = rows.find(
        (r) => r.user_id === pending.user_id && r.idempotency_key === pending.idempotency_key,
      );
      if (existing) {
        if (isDifferentUnattachedPayment(existing, pending)) {
          return {
            error: { status: 409, code: 'PAYMENT_KEY_REUSED', message: 'different money' },
            fatal: true,
          };
        }
        return { error: { code: '23505', message: 'other_income_user_idempotency_key_uidx' } };
      }
      rows.push({ ...pending, id: `row-${rows.length + 1}` });
      return { error: null };
    },
    findByKey: async (userId, key) =>
      rows.find((r) => r.user_id === userId && r.idempotency_key === key) ?? null,
  };
  return { io, rows };
}

test('a replay writes one row and returns the original', async () => {
  const { io, rows } = memory();
  const first = await saveUnattachedPaymentOnce(io, ROW);
  const replay = await saveUnattachedPaymentOnce(io, ROW);

  assert.equal(first.ok, true);
  assert.equal(replay.ok, true);
  assert.equal(rows.length, 1, 'the retry wrote nothing');
  if (first.ok && replay.ok) assert.equal(replay.payment.id, first.payment.id);
});

test('the same key with different money is refused, not reported as a repeat', async () => {
  const { io, rows } = memory();
  await saveUnattachedPaymentOnce(io, ROW);
  const changed = unattachedInsertRow('user-a', { ...input, amount: 121 }, KEY);
  const out = await saveUnattachedPaymentOnce(io, changed);

  assert.equal(out.ok, false);
  assert.equal(rows.length, 1);
  if (!out.ok) assert.equal((out.error as { code?: string }).code, 'PAYMENT_KEY_REUSED');
});

test('a key already spent by another owner never returns their row', async () => {
  const { io } = memory();
  await saveUnattachedPaymentOnce(io, ROW);
  const otherOwner = unattachedInsertRow('user-b', input, KEY);
  const out = await saveUnattachedPaymentOnce(io, otherOwner);
  // Same key, different owner: the store treats it as a new row for user-b.
  assert.equal(out.ok, true);
  if (out.ok) assert.notEqual(out.payment.id, 'row-1');
});

test('a real failure is not forgiven when no row exists for the key', async () => {
  const io: UnattachedPaymentIO = {
    insertOnce: async () => ({ error: { code: '42501', message: 'row-level security' } }),
    findByKey: async () => null,
  };
  const out = await saveUnattachedPaymentOnce(io, ROW);
  assert.equal(out.ok, false);
  if (!out.ok) assert.equal((out.error as { code?: string }).code, '42501');
});

test('a write that cannot be read back is never reported as success', async () => {
  const io: UnattachedPaymentIO = {
    insertOnce: async () => ({ error: null }),
    findByKey: async () => null,
  };
  const out = await saveUnattachedPaymentOnce(io, ROW);
  assert.equal(out.ok, false);
  if (!out.ok) assert.match(String((out.error as Error).message), /missing after insert/);
});

test('the route saves through the one-row sequence, on the session', () => {
  const route = readFileSync(
    join(process.cwd(), 'src', 'app', 'api', 'income', 'unattached', 'route.ts'),
    'utf8',
  );
  assert.match(route, /saveUnattachedPaymentOnce\(io, row\)/);
  assert.match(route, /\.select\('id, amount, received_on, method, idempotency_key'\)/);
  assert.match(route, /\.eq\('idempotency_key', k\)/);
  assert.match(route, /PAYMENT_KEY_REUSED/);
  assert.match(route, /isDifferentUnattachedPayment\(existing, pending\)/);
  assert.doesNotMatch(route, /adminClient/);
});
