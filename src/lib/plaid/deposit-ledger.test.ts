// The ledger row a deposit writes, and its idempotency key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { depositPaymentKey, depositPaymentRow, wouldExceedDeposit } from './deposit-ledger';

test('the key is bank:<deposit id>, so a double tap adopts one row', () => {
  assert.equal(depositPaymentKey('dep-1'), 'bank:dep-1');
  assert.equal(depositPaymentKey('dep-1'), depositPaymentKey('dep-1'));
  assert.notEqual(depositPaymentKey('dep-1'), depositPaymentKey('dep-2'));
});

test('the row is method bank / paid_source manual, dated on the deposit day, in exact cents', () => {
  const row = depositPaymentRow({
    userId: 'u1',
    invoiceId: 'i1',
    depositId: 'dep-1',
    amountCents: 123456,
    occurredOn: '2026-10-28',
  });
  assert.deepEqual(row, {
    invoice_id: 'i1',
    user_id: 'u1',
    amount: '1234.56',
    method: 'bank',
    paid_source: 'manual',
    paid_at: '2026-10-28T12:00:00.000Z',
    note: 'Recorded from a bank deposit',
    idempotency_key: 'bank:dep-1',
  });
});

test('the over-sum boundary refuses only above the deposit', () => {
  assert.equal(wouldExceedDeposit(6000, 10000, 4000), false, 'exactly the deposit is allowed');
  assert.equal(wouldExceedDeposit(6000, 10000, 4001), true);
  assert.equal(wouldExceedDeposit(0, 10000, 10001), true);
  assert.equal(wouldExceedDeposit(Number.NaN, 10000, 1), true, 'a bad number fails closed');
});
