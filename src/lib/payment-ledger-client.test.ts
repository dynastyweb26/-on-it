// The ledger adapter is the only place that talks to PostgREST about a repeat,
// so the repeat rule is pinned here. The fake client deliberately has NO
// `upsert`: the code this file guards against called
// `.upsert(..., { onConflict: 'user_id,idempotency_key' })`, which Postgres
// rejects against the partial index ("there is no unique or exclusion
// constraint matching the ON CONFLICT specification") — so this file fails on
// that code rather than passing on a mock of it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ledgerFrom,
  isIdempotencyConflict,
  PAYMENT_IDEMPOTENCY_CONSTRAINT,
} from './payment-ledger-client';
import { newPaymentKey, recordPaymentOnce } from './payment-idempotency';
import type { PaymentRowInput } from './payment-idempotency';

type SavedRow = PaymentRowInput & { id: string };

// Exactly what PostgREST returns for a repeat: 409 + 23505 + the index name.
const conflictError = () => ({
  code: '23505',
  status: 409,
  message: `duplicate key value violates unique constraint "${PAYMENT_IDEMPOTENCY_CONSTRAINT}"`,
  details: 'Key (user_id, idempotency_key)=(user-1, pay-inv-1-fixed) already exists.',
});

// invoice_payments as the client sees it: a plain insert and the keyed
// read-back, with the partial unique index enforced.
function fakeClient(opts: { seed?: SavedRow[]; alwaysFail?: unknown } = {}) {
  const rows: SavedRow[] = [...(opts.seed ?? [])];
  const inserted: PaymentRowInput[] = [];
  let seq = rows.length;

  const client = {
    from(table: string) {
      assert.equal(table, 'invoice_payments');
      return {
        // No upsert: that call is the bug, and its absence is the test.
        insert(row: PaymentRowInput) {
          inserted.push(row);
          if (opts.alwaysFail) return { error: opts.alwaysFail };
          const dupe = rows.find((r) => r.user_id === row.user_id && r.idempotency_key === row.idempotency_key);
          if (dupe) return { error: conflictError() };
          const saved: SavedRow = { ...row, id: `pay-${++seq}` };
          rows.push(saved);
          return { error: null };
        },
        select() {
          let userId: string | null = null;
          let key: string | null = null;
          const chain = {
            eq(column: string, value: string) {
              if (column === 'user_id') userId = value;
              if (column === 'idempotency_key') key = value;
              return chain;
            },
            maybeSingle: async () => ({
              data: rows.find((r) => r.user_id === userId && r.idempotency_key === key) ?? null,
              error: null,
            }),
          };
          return chain;
        },
      };
    },
  };

  return { ledger: ledgerFrom(client as unknown as Parameters<typeof ledgerFrom>[0]), rows, inserted };
}

const base = (key: string): PaymentRowInput => ({
  invoice_id: 'inv-1',
  user_id: 'user-1',
  amount: 250,
  method: 'zelle',
  paid_at: '2026-10-29T04:00:00.000Z',
  idempotency_key: key,
});

test('the conflict is recognised only by the idempotency index name', () => {
  assert.equal(isIdempotencyConflict(conflictError()), true);
  assert.equal(isIdempotencyConflict({ code: '23505', message: 'duplicate key value violates unique constraint "invoice_payments_pkey"' }), false);
  assert.equal(isIdempotencyConflict({ code: '23505' }), false);
  assert.equal(isIdempotencyConflict({ code: '42P10', message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification' }), false);
  assert.equal(isIdempotencyConflict(null), false);
});

test('two submissions with one key end as one row and both read as ok', async () => {
  const { ledger, rows, inserted } = fakeClient();
  const key = newPaymentKey('inv-1', 'fixed');

  const first = await recordPaymentOnce(ledger, base(key));
  const second = await recordPaymentOnce(ledger, base(key));

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  // Both attempts reached the database; exactly one row exists.
  assert.equal(inserted.length, 2);
  assert.equal(rows.length, 1);
  assert.equal(second.payment?.id, first.payment?.id);
});

test('a repeat with a different amount under the same key fails', async () => {
  const key = newPaymentKey('inv-1', 'fixed');
  const { ledger, rows } = fakeClient({ seed: [{ ...base(key), id: 'pay-seed', amount: 250 }] });

  const result = await recordPaymentOnce(ledger, { ...base(key), amount: 25 });

  assert.equal(result.ok, false);
  assert.equal(result.payment, null);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, 250);
});

test('a repeat for a different invoice under the same key fails', async () => {
  const key = newPaymentKey('inv-1', 'fixed');
  const { ledger, rows } = fakeClient({ seed: [{ ...base(key), id: 'pay-seed' }] });

  const result = await recordPaymentOnce(ledger, { ...base(key), invoice_id: 'inv-2' });

  assert.equal(result.ok, false);
  assert.equal(result.payment, null);
  assert.equal(rows.length, 1);
});

test('a missing insert permission fails and writes nothing', async () => {
  const { ledger, rows } = fakeClient({
    alwaysFail: { code: '42501', status: 403, message: 'permission denied for table invoice_payments' },
  });

  const result = await recordPaymentOnce(ledger, base(newPaymentKey('inv-1', 'denied')));

  assert.equal(result.ok, false);
  assert.equal(result.payment, null);
  assert.equal(rows.length, 0);
});

test('another unique violation is a failure, not a repeat', async () => {
  const { ledger, rows } = fakeClient({
    alwaysFail: { code: '23505', status: 409, message: 'duplicate key value violates unique constraint "invoice_payments_pkey"' },
  });

  const result = await recordPaymentOnce(ledger, base(newPaymentKey('inv-1', 'pkey')));

  assert.equal(result.ok, false);
  assert.equal(result.payment, null);
  assert.equal(rows.length, 0);
});
