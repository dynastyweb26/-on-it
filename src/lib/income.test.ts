// Income: two sources in one list, and the figures Collected shows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayOf, groupIncome, incomeMoney, incomeTotal, mergeIncome, paymentTitle, searchIncome,
  type OtherIncomeSource, type PaymentSource,
} from './income';

const payment = (over: Partial<PaymentSource> = {}): PaymentSource => ({
  id: 'pay-1', invoice_id: 'inv-1', amount: '500.00', paid_at: '2026-10-20T14:03:00Z',
  method: 'zelle', entry_type: 'payment', client_name: 'Cyril', invoice_number: 42, ...over,
});

const other = (over: Partial<OtherIncomeSource> = {}): OtherIncomeSource => ({
  id: 'oi-1', amount: '1200.00', title: 'Storage unit rent', client_name: null,
  received_on: '2026-11-01', note: null, deposit_id: null, classification: 'other_income',
  deleted_at: null, ...over,
});

test('a payment reads INV-0042 · Cyril and a plain payment reads something', () => {
  assert.equal(paymentTitle(payment()), 'INV-0042 · Cyril');
  assert.equal(paymentTitle(payment({ client_name: null })), 'INV-0042');
  assert.equal(paymentTitle(payment({ invoice_number: null, client_name: null })), 'Invoice payment');
});

test('both sources land in one list, newest first', () => {
  const rows = mergeIncome([payment()], [other()]);
  assert.deepEqual(rows.map((row) => row.key), ['other-oi-1', 'payment-pay-1']);
  assert.equal(rows[0].kind, 'other');
  assert.equal(rows[1].amountCents, 50000);
  // A payment's timestamp is read as its day, never as a time.
  assert.equal(rows[1].date, '2026-10-20');
});

test('only income counts: refunds, transfers and unknowns never reach the list', () => {
  const rows = mergeIncome([], [
    other({ id: 'a', classification: 'customer_payment' }),
    other({ id: 'b', classification: 'vendor_refund' }),
    other({ id: 'c', classification: 'transfer' }),
    other({ id: 'd', classification: 'unknown' }),
    other({ id: 'e', classification: null }),
    other({ id: 'f', deleted_at: '2026-11-02T00:00:00Z' }),
  ]);
  assert.deepEqual(rows.map((row) => row.key), ['other-a']);
});

test('a reversal or a zero row is not income', () => {
  const rows = mergeIncome([
    payment({ id: 'rev', entry_type: 'reversal' }),
    payment({ id: 'zero', amount: '0' }),
    payment({ id: 'bad', amount: 'not money' }),
  ], []);
  assert.deepEqual(rows, []);
});

test('a bank-linked payment and a deposit row both read Bank-verified', () => {
  const [linked] = mergeIncome([payment({ bank_verified: true })], []);
  const [fromDeposit] = mergeIncome([], [other({ deposit_id: 'dep-9' })]);
  assert.equal(linked.bankVerified, true);
  assert.equal(fromDeposit.bankVerified, true);
  assert.equal(mergeIncome([payment()], [])[0].bankVerified, false);
});

test('search reads the title, the detail and the client', () => {
  const rows = mergeIncome([payment()], [other()]);
  assert.equal(searchIncome(rows, 'cyril').length, 1);
  assert.equal(searchIncome(rows, 'storage').length, 1);
  assert.equal(searchIncome(rows, 'other income').length, 1);
  assert.equal(searchIncome(rows, '  ').length, 2);
  assert.equal(searchIncome(rows, 'nothing').length, 0);
});

test('groups subtotal their own rows, months newest first', () => {
  const rows = mergeIncome(
    [payment({ id: 'p1', amount: '500.00', paid_at: '2026-10-20' })],
    [other({ id: 'o1', amount: '1200.00', received_on: '2026-11-01' }),
      other({ id: 'o2', amount: '300.50', received_on: '2026-11-02' })],
  );
  const months = groupIncome(rows, 'month');
  assert.deepEqual(months.map((group) => group.key), ['2026-11', '2026-10']);
  assert.equal(months[0].subtotal, 150050);
  assert.equal(months[1].subtotal, 50000);
  // A month with ONLY other income is a real month, not an empty one.
  assert.deepEqual(months[0].rows.map((row) => row.key), ['other-o2', 'other-o1']);
});

test('week groups stay inside their month and still add up to it', () => {
  const rows = mergeIncome([], [
    other({ id: 'a', received_on: '2026-10-01', amount: '1.00' }),
    other({ id: 'b', received_on: '2026-10-31', amount: '2.00' }),
  ]);
  const weeks = groupIncome(rows, 'week');
  const month = groupIncome(rows, 'month');
  assert.equal(weeks.length, 2);
  assert.equal(weeks.reduce((sum, group) => sum + group.subtotal, 0), month[0].subtotal);
  // No week label reaches into the next month.
  assert.equal(weeks.some((group) => /Nov/.test(group.label)), false);
});

test('the total is cents, and money always shows its direction', () => {
  const rows = mergeIncome([payment({ amount: '500.00' })], [other({ amount: '1200.00' })]);
  assert.equal(incomeTotal(rows), 170000);
  assert.equal(incomeMoney(170000), '+$1,700.00');
  assert.equal(incomeMoney(0), '+$0.00');
});

test('a missing timestamp is skipped rather than dated today', () => {
  assert.equal(dayOf(null), '');
  assert.equal(dayOf('2026-11-01T23:59:00Z'), '2026-11-01');
  assert.deepEqual(mergeIncome([payment({ paid_at: null })], []), []);
});
