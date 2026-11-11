// An unattached payment is only useful if the money shows up. Books already
// sums other_income beside the ledger, so the row must reach Collected, Net and
// the Income list without any new read path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chartPoints } from './books-chart';
import { mergeIncome } from './income';
import { countsAsIncome, sumOtherIncome } from './other-income';
import { unattachedInsertRow } from './unattached-payment';

const INPUT = {
  amount: 120,
  method: 'zelle' as const,
  received_on: '2026-11-11',
  title: 'Side job',
};

const row = unattachedInsertRow('user-a', INPUT, 'income-key-1');
const live = {
  amount: String(row.amount),
  received_on: row.received_on,
  classification: row.classification,
  deleted_at: null,
};

test('the row is the classification Collected counts', () => {
  assert.equal(row.classification, 'other_income');
  assert.equal(countsAsIncome(row.classification), true);
});

test('Collected includes an unattached payment', () => {
  assert.equal(sumOtherIncome([live]), 120);
  // …and a deleted one counts nowhere.
  assert.equal(sumOtherIncome([{ ...live, deleted_at: '2026-11-12' }]), 0);
});

test('Net includes it: collected minus spent for the month', () => {
  const points = chartPoints([], [live], [{ amount: '20.00', spent_on: '2026-11-11' }], 'month');
  const month = points.find((p) => p.key === '2026-11');
  assert.ok(month, 'the month exists because the payment is money in');
  assert.equal(month.collectedCents, 12_000);
  assert.equal(month.spentCents, 2_000);
  assert.equal(month.keptCents, 10_000);
});

test('the Income list shows it under the name the owner typed', () => {
  const rows = mergeIncome(null, [{
    id: 'other-1',
    amount: '120.00',
    title: 'Side job',
    client_name: null,
    received_on: '2026-11-11',
    classification: 'other_income',
    deposit_id: null,
  }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'other');
  assert.equal(rows[0].title, 'Side job');
  assert.equal(rows[0].amountCents, 12_000);
  assert.equal(rows[0].date, '2026-11-11');
  assert.equal(rows[0].fromDeposit, false);
  assert.equal(rows[0].bankVerified, false);
});
