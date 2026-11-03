// The Books chart: what it counts, and where it draws it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bucketOf, chartPoints, chartTop, easeEnds, grainOptions, peakLabelX, plotX, presetStart, resolveGrain,
} from './books-chart';

const pay = (amount: string, paid_at: string) => ({ amount, paid_at });

test('a month with ONLY other income is a real month', () => {
  const points = chartPoints([], [
    { amount: '1200.00', received_on: '2026-11-01', classification: 'other_income' },
  ], [], 'month');
  assert.equal(points.length, 1);
  assert.equal(points[0].key, '2026-11');
  assert.equal(points[0].collectedCents, 120000);
  assert.equal(points[0].spentCents, 0);
  assert.equal(points[0].keptCents, 120000);
});

test('a refund nets Collected instead of being ignored', () => {
  const points = chartPoints(
    [pay('500.00', '2026-10-04'), pay('-200.00', '2026-10-09')],
    [],
    [{ amount: '100.00', spent_on: '2026-10-10' }],
    'month',
  );
  assert.equal(points.length, 1);
  assert.equal(points[0].collectedCents, 30000);
  assert.equal(points[0].spentCents, 10000);
  assert.equal(points[0].keptCents, 20000);
});

test('only the two counting classifications reach the chart', () => {
  const points = chartPoints([], [
    { amount: '50.00', received_on: '2026-10-01', classification: 'other_income' },
    { amount: '70.00', received_on: '2026-10-01', classification: 'transfer' },
    { amount: '90.00', received_on: '2026-10-01', classification: 'unknown' },
    { amount: '10.00', received_on: '2026-10-01', classification: 'other_income', deleted_at: '2026-10-02' },
  ], [], 'month');
  assert.equal(points[0].collectedCents, 5000);
});

test('months are ordered oldest first and gaps stay zero rows', () => {
  const points = chartPoints(
    [pay('10.00', '2026-08-02'), pay('20.00', '2026-10-02')],
    [{ amount: '30.00', received_on: '2026-10-03', classification: 'customer_payment' }],
    [],
    'month',
  );
  assert.deepEqual(points.map((p) => p.key), ['2026-08', '2026-10']);
  assert.equal(points[1].collectedCents, 5000);
});

test('weekly buckets stay inside their month', () => {
  assert.deepEqual(bucketOf('2026-10-01', 'week'), { key: '2026-10-w0', label: 'Oct 1–7' });
  assert.deepEqual(bucketOf('2026-10-31', 'week'), { key: '2026-10-w4', label: 'Oct 29–31' });
  assert.equal(bucketOf('2026-10-31', 'month').key, '2026-10');
});

test('the data is inset 3% from both edges', () => {
  assert.equal(plotX(0, 3, 1000), 30);
  assert.equal(plotX(2, 3, 1000), 970);
  assert.equal(plotX(1, 3, 1000), 500);
  // One point sits in the middle rather than on the axis.
  assert.equal(plotX(0, 1, 1000), 500);
});

test('the first and last points ease in; the middle is untouched', () => {
  const eased = easeEnds([0, 100, 50]);
  assert.equal(eased[1], 100);
  assert.equal(eased[0], 15);
  assert.equal(eased[2], 57.5);
  assert.deepEqual(easeEnds([1, 2]), [1, 2]);
});

test('a peak label that would hit the y-axis shifts right', () => {
  assert.equal(peakLabelX(10, 16, 24), 40);
  assert.equal(peakLabelX(200, 16, 24), 200);
});

test('the axis top is a round number above the biggest value', () => {
  assert.equal(chartTop([0]), 0);
  assert.equal(chartTop([1234]), 1500);
  // At or above the largest value: a value already round stays itself.
  assert.equal(chartTop([900]), 900);
});

test('the grain choice follows the period and falls back to Months', () => {
  assert.deepEqual(grainOptions('all'), ['month', 'year']);
  assert.deepEqual(grainOptions('last3m'), ['week', 'month']);
  assert.deepEqual(grainOptions('this_month'), ['week', 'month']);
  // Picking Weeks then switching to All time does not leave a dead toggle.
  assert.equal(resolveGrain('all', 'week'), 'month');
  assert.equal(resolveGrain('all', 'year'), 'year');
  assert.equal(resolveGrain('last3m', 'year'), 'month');
  assert.equal(resolveGrain('last3m', 'month'), 'month');
});

test('a preset starts where it says it does', () => {
  assert.equal(presetStart('all', '2026-11-03'), '');
  assert.equal(presetStart('this_month', '2026-11-03'), '2026-11-01');
  assert.equal(presetStart('last3m', '2026-11-03'), '2026-09-01');
  assert.equal(presetStart('last3m', '2026-02-15'), '2025-12-01');
});

test('a year grain buckets by year', () => {
  const points = chartPoints(
    [{ amount: '100.00', paid_at: '2025-04-01' }, { amount: '200.00', paid_at: '2026-04-01' }],
    [], [], 'year',
  );
  assert.deepEqual(points.map((p) => p.key), ['2025', '2026']);
  assert.equal(points[1].collectedCents, 20000);
});
