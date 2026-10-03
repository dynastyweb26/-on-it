import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeLine, money, monthName, periodLabel, plural } from './copy';
import { fixturePayload } from '@/lib/recap/fixtures';

test('money: whole dollars, −$ for negatives', () => {
  assert.equal(money(1636.4), '$1,636');
  assert.equal(money(-480), '−$480');
  assert.equal(plural(1, 'trip', 'trips'), '1 trip');
});

test('labels: period range and month name from local dates', () => {
  assert.equal(periodLabel({ start: '2026-09-22', end: '2026-09-28' }), 'Sep 22 – Sep 28');
  assert.equal(monthName({ start: '2026-09-01' }), 'September');
});

test('change chip: vs last week / the previous month (Jan → December); none without a comparison', () => {
  assert.deepEqual(changeLine(fixturePayload('normalWeek')), { dir: 'up', text: 'Up 18% from last week' });
  assert.deepEqual(changeLine(fixturePayload('quietMonth')), { dir: 'down', text: 'Down 22% from August' });
  assert.deepEqual(changeLine({ kind: 'month', start: '2027-01-01', change: { prevNet: 1, pct: 5, direction: 'up' } }), { dir: 'up', text: 'Up 5% from December' });
  assert.deepEqual(changeLine({ kind: 'week', start: '2026-09-21', change: { prevNet: 1, pct: 0, direction: 'flat' } }), { dir: 'flat', text: 'About the same as last week' });
  assert.equal(changeLine(fixturePayload('investmentWeek')), null);
});
