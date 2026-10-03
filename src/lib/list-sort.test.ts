import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupByPeriod } from './date-groups';
import { readListSort, sortWithinGroups } from './list-sort';

type R = { name: string; at: string; amt: number };
const rows: R[] = [
  { name: 'bob smith', at: '2026-09-28', amt: 10 },
  { name: 'Zed', at: '2026-09-21', amt: 5 },
  { name: 'Alice', at: '2026-09-02', amt: 7 },
  { name: 'Bob Smith', at: '2026-09-30', amt: 1 },
  { name: 'Carl', at: '2026-08-20', amt: 3 },
  { name: '', at: '2026-08-25', amt: 2 },
  { name: 'aaron', at: '2026-08-01', amt: 4 },
];

test('A–Z inside each month, case-insensitive, tie → newest first; groups untouched', () => {
  const newest = [...rows].sort((a, b) => b.at.localeCompare(a.at));
  const g = groupByPeriod(newest, (r) => r.at, (r) => r.amt, 'month');
  const az = sortWithinGroups(g, (r) => r.name, (r) => r.at);
  assert.deepEqual(az.map((x) => x.key), g.map((x) => x.key));              // same groups, same order
  assert.deepEqual(az.map((x) => x.subtotal), g.map((x) => x.subtotal));    // same subtotals
  assert.deepEqual(az[0].items.map((r) => `${r.name}@${r.at}`), ['Alice@2026-09-02', 'Bob Smith@2026-09-30', 'bob smith@2026-09-28', 'Zed@2026-09-21']);
  assert.deepEqual(az[1].items.map((r) => r.name), ['aaron', 'Carl', '']);  // blank names last
  assert.deepEqual(g[0].items.map((r) => r.name), ['Bob Smith', 'bob smith', 'Zed', 'Alice']); // input not mutated
});

test('weekly groups keep their subtotals', () => {
  const g = groupByPeriod([...rows].sort((a, b) => b.at.localeCompare(a.at)), (r) => r.at, (r) => r.amt, 'week');
  const az = sortWithinGroups(g, (r) => r.name, (r) => r.at);
  assert.deepEqual(az.map((x) => [x.key, x.subtotal]), g.map((x) => [x.key, x.subtotal]));
});

test('stored choice: Newest unless "az"; blocked storage → Newest', () => {
  assert.equal(readListSort('k'), 'newest');   // no localStorage in node → caught → newest
});
