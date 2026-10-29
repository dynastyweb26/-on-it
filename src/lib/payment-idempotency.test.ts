import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newPaymentKey, recordPaymentOnce } from './payment-idempotency';
import type { PaymentLedgerIO, PaymentLedgerRow, PaymentRowInput } from './payment-idempotency';

// A stand-in for invoice_payments + the amount_paid trigger. It enforces the
// same rule as the migration's partial unique index: (user_id, idempotency_key)
// is unique, and a repeat is ignored rather than raising. amount_paid is
// recomputed from the ledger, exactly as the trigger does.
function fakeLedger() {
  const rows: PaymentLedgerRow[] = [];
  const amountPaid: Record<string, number> = {};
  let seq = 0;
  const io: PaymentLedgerIO = {
    insertOnce: async (row: PaymentRowInput) => {
      const dupe = rows.some((r) => r.user_id === row.user_id && r.idempotency_key === row.idempotency_key);
      if (dupe) return { error: null };
      rows.push({ ...row, id: `pay-${++seq}` });
      amountPaid[row.invoice_id] = Number(((amountPaid[row.invoice_id] ?? 0) + row.amount).toFixed(2));
      return { error: null };
    },
    findByKey: async (userId, key) =>
      rows.find((r) => r.user_id === userId && r.idempotency_key === key) ?? null,
  };
  return { io, rows, amountPaid };
}

const base = (key: string): PaymentRowInput => ({
  invoice_id: 'inv-1',
  user_id: 'user-1',
  amount: 250,
  method: 'zelle',
  paid_at: '2026-10-29T04:00:00.000Z',
  idempotency_key: key,
});

test('same key twice writes one row and counts the money once', async () => {
  const { io, rows, amountPaid } = fakeLedger();
  const key = newPaymentKey('inv-1', 'fixed-uuid');

  const first = await recordPaymentOnce(io, base(key));
  const second = await recordPaymentOnce(io, base(key));

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(rows.length, 1);
  assert.equal(amountPaid['inv-1'], 250);
  // A repeat returns the original row, not a new one.
  assert.equal(second.payment?.id, first.payment?.id);
});

test('two different keys record two payments', async () => {
  const { io, rows, amountPaid } = fakeLedger();

  await recordPaymentOnce(io, base(newPaymentKey('inv-1', 'uuid-a')));
  await recordPaymentOnce(io, base(newPaymentKey('inv-1', 'uuid-b')));

  assert.equal(rows.length, 2);
  assert.equal(amountPaid['inv-1'], 500);
});

test('a lost response is not a lost payment: read-back returns the original', async () => {
  const { io, rows, amountPaid } = fakeLedger();
  const key = newPaymentKey('inv-1', 'uuid-lost');
  // The write lands, but the response never reaches the client.
  const losingIo: PaymentLedgerIO = {
    insertOnce: async (row) => {
      await io.insertOnce(row);
      return { error: { message: 'Failed to fetch' } };
    },
    findByKey: io.findByKey,
  };

  const result = await recordPaymentOnce(losingIo, base(key));
  const retry = await recordPaymentOnce(io, base(key));

  assert.equal(result.ok, true);
  assert.equal(retry.ok, true);
  assert.equal(rows.length, 1);
  assert.equal(amountPaid['inv-1'], 250);
  assert.equal(retry.payment?.id, result.payment?.id);
});

test('a real failure with nothing written stays a failure', async () => {
  const { io, rows, amountPaid } = fakeLedger();
  const brokenIo: PaymentLedgerIO = {
    insertOnce: async () => ({ error: { code: '42501', message: 'permission denied' } }),
    findByKey: io.findByKey,
  };

  const result = await recordPaymentOnce(brokenIo, base(newPaymentKey('inv-1', 'uuid-deny')));

  assert.equal(result.ok, false);
  assert.equal(result.payment, null);
  assert.equal(rows.length, 0);
  assert.equal(amountPaid['inv-1'], undefined);
});

test('the key is unique per submission and names its invoice', () => {
  const a = newPaymentKey('inv-1');
  const b = newPaymentKey('inv-1');
  assert.notEqual(a, b);
  assert.match(a, /^pay-inv-1-/);
  assert.equal(newPaymentKey('inv-9', 'fixed'), 'pay-inv-9-fixed');
});
