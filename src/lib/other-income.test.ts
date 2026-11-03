// Other money received: six classifications, two of which count, and the sum
// every Collected reader uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OTHER_INCOME_TITLE_MAX, OTHER_MONEY_RECEIVED, classificationLabel, countsAsIncome,
  incomeClassification, isClassification, otherIncomeFromDeposit, sumOtherIncome,
  type OtherIncomeRow,
} from './other-income';

test('the six classifications are the spec, in order, with "Unknown" last', () => {
  assert.deepEqual(OTHER_MONEY_RECEIVED.map((o) => o.value), [
    'customer_payment', 'vendor_refund', 'transfer', 'loan_or_owner', 'other_income', 'unknown',
  ]);
  assert.deepEqual(OTHER_MONEY_RECEIVED.map((o) => o.label), [
    'Customer payment', 'Vendor refund', 'Transfer', 'Loan or owner money', 'Other income', 'Unknown',
  ]);
});

test('exactly two count in Collected: Customer payment and Other income', () => {
  const counting = OTHER_MONEY_RECEIVED.filter((o) => o.counts).map((o) => o.value);
  assert.deepEqual(counting, ['customer_payment', 'other_income']);
  for (const option of OTHER_MONEY_RECEIVED) {
    assert.equal(countsAsIncome(option.value), option.counts, option.value);
  }
});

test('an unrecognised value is never income, so a typo cannot inflate Collected', () => {
  assert.equal(countsAsIncome('vendor_refund'), false);
  assert.equal(countsAsIncome('transfer'), false);
  assert.equal(countsAsIncome('loan_or_owner'), false);
  assert.equal(countsAsIncome('unknown'), false);
  assert.equal(countsAsIncome('customer_payments'), false);
  assert.equal(countsAsIncome(''), false);
  assert.equal(countsAsIncome(null), false);
  assert.equal(countsAsIncome(undefined), false);
  assert.equal(isClassification('Customer payment'), false);
});

test('only the two income values become an other_income row', () => {
  assert.equal(incomeClassification('customer_payment'), 'customer_payment');
  assert.equal(incomeClassification('other_income'), 'other_income');
  // The non-income four are a link decision, never a row in this table.
  assert.equal(incomeClassification('vendor_refund'), null);
  assert.equal(incomeClassification('transfer'), null);
  assert.equal(incomeClassification('loan_or_owner'), null);
  assert.equal(incomeClassification('unknown'), null);
});

test('the label is the stored sentence, and never a blank row', () => {
  assert.equal(classificationLabel('loan_or_owner'), 'Loan or owner money');
  assert.equal(classificationLabel('nonsense'), 'Other money received');
  assert.equal(classificationLabel(null), 'Other money received');
});

test('Collected sums live rows and skips everything that does not count', () => {
  const rows: OtherIncomeRow[] = [
    { amount: '450.00', classification: 'customer_payment' },
    { amount: '120.50', classification: 'other_income' },
    // Soft-deleted: counts in nothing.
    { amount: '999.00', classification: 'customer_payment', deleted_at: '2026-10-30T00:00:00Z' },
    // A non-income classification must never reach this table, but if it does
    // it still adds nothing.
    { amount: '500.00', classification: 'unknown' },
    { amount: '75.00', classification: 'transfer' },
    // Junk amounts add nothing either.
    { amount: null },
    { amount: '0' },
    { amount: '-40.00' },
    { amount: 'abc' },
  ];
  assert.equal(sumOtherIncome(rows), 570.5);
  assert.equal(sumOtherIncome([]), 0);
  assert.equal(sumOtherIncome(null), 0);
});

test('the sum is cents-exact, with no float tail on the tile', () => {
  assert.equal(sumOtherIncome([{ amount: '0.10' }, { amount: '0.20' }]), 0.3);
  assert.equal(sumOtherIncome([{ amount: '1204.99' }, { amount: '0.01' }]), 1205);
});

test('a deposit decided as income becomes a row pointing back at the deposit', () => {
  const row = otherIncomeFromDeposit({
    userId: 'user-1',
    depositId: 'dep-1',
    amount: '450.00',
    title: '  STRIPE TRANSFER  ',
    receivedOn: '2026-10-28',
    classification: 'customer_payment',
  });
  assert.deepEqual(row, {
    user_id: 'user-1',
    amount: '450.00',
    title: 'STRIPE TRANSFER',
    client_name: null,
    received_on: '2026-10-28',
    note: null,
    deposit_id: 'dep-1',
    classification: 'customer_payment',
  });
});

test('a deposit name longer than the column cap is trimmed, never rejected', () => {
  const long = 'A'.repeat(OTHER_INCOME_TITLE_MAX + 80);
  const row = otherIncomeFromDeposit({
    userId: 'user-1', depositId: 'dep-1', amount: '10.00',
    title: long, receivedOn: '2026-10-28', classification: 'other_income',
  });
  assert.equal(row.title.length, OTHER_INCOME_TITLE_MAX);
});

test('an unusable name still yields a readable title, not an empty one', () => {
  const row = otherIncomeFromDeposit({
    userId: 'user-1', depositId: 'dep-1', amount: '10.00',
    title: '   ', receivedOn: '2026-10-28', classification: 'other_income',
  });
  assert.equal(row.title, 'Bank deposit');
});
