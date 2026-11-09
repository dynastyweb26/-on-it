import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRecap, dayKey, isEmptyRecap, matchRecap, owedAndOverdue, recapsDue, startOfWeekMonday, sumPayments, weekBars, weekKey } from './chat-recap';

// Sat Nov 7 2026, 8:00 local (Nov 9 is the Monday).
const fri = new Date(2026, 10, 7, 8, 0, 0);
const mon = new Date(2026, 10, 9, 8, 0, 0);
const at = (m: number, d: number, h = 12) => new Date(2026, m, d, h).toISOString();

test('the week starts on Monday', () => {
  assert.equal(dayKey(startOfWeekMonday(fri)), '2026-11-02');
  assert.equal(dayKey(startOfWeekMonday(new Date(2026, 10, 8, 23))), '2026-11-02'); // Sunday
  assert.equal(weekKey(mon), '2026-11-09');
});

test('money in sums payments in the window and ignores refunds and other entries', () => {
  const rows = [
    { amount: 100, paid_at: at(10, 6) },
    { amount: 75, paid_at: at(10, 6, 18), entry_type: 'payment' },
    { amount: 50, paid_at: at(10, 6), entry_type: 'refund' },
    { amount: 20, paid_at: at(10, 5) },
  ];
  assert.equal(sumPayments(rows, new Date(2026, 10, 6), new Date(2026, 10, 7)), 175);
});

test('a morning recap covers yesterday; "today so far" covers today', () => {
  const payments = [{ amount: 175, paid_at: at(10, 6) }, { amount: 40, paid_at: at(10, 7, 7) }];
  const auto = buildRecap({ now: fri, kind: 'daily', mode: 'auto', payments, open: [], signed: [] });
  assert.equal(auto.moneyIn, 175);
  assert.equal(auto.metaLabel, 'Morning recap · Sat Nov 7');
  assert.equal(auto.title, 'Good morning.');
  const now = buildRecap({ now: fri, kind: 'daily', mode: 'now', payments, open: [], signed: [] });
  assert.equal(now.moneyIn, 40);
  assert.equal(now.title, 'Here’s today.');
});

test('owed and overdue come from open invoices only', () => {
  const r = owedAndOverdue([
    { total: 150, amount_paid: 0, status: 'overdue', due_date: '2026-11-04' },
    { total: 150, amount_paid: 25, status: 'sent', due_date: '2026-11-14' },
    { total: 80, amount_paid: 0, status: 'sent', due_date: '2026-11-01' },
    { total: 90, amount_paid: 90, status: 'paid', due_date: null },
    { total: 40, amount_paid: 0, status: 'draft', due_date: null },
  ], fri);
  assert.equal(r.owed, 150 + 125 + 80);
  assert.equal(r.overdue, 2);
});

test('signed estimates count inside the window', () => {
  const m = buildRecap({ now: fri, kind: 'daily', mode: 'auto', payments: [], open: [], signed: [{ approved_at: at(10, 6) }, { approved_at: at(10, 7, 6) }, { approved_at: at(10, 5) }] });
  assert.equal(m.signed, 1);
});

test('weekly: last week, seven bars, a quiet day never rounds to nothing', () => {
  // Mon Nov 2 .. Sun Nov 8; recap opened Mon Nov 9.
  const payments = [
    { amount: 300, paid_at: at(10, 2) }, { amount: 550, paid_at: at(10, 3) }, { amount: 200, paid_at: at(10, 4) },
    { amount: 800, paid_at: at(10, 5) }, { amount: 1000, paid_at: at(10, 6) }, { amount: 4, paid_at: at(10, 7) },
  ];
  const m = buildRecap({ now: mon, kind: 'weekly', mode: 'auto', payments, open: [], signed: [] });
  assert.equal(m.metaLabel, 'Week of Nov 2');
  assert.equal(m.moneyIn, 2854);
  assert.equal(m.bars?.length, 7);
  assert.equal(m.bars?.[4].pct, 100);
  assert.equal(m.bars?.[4].best, true);
  assert.equal(m.bars?.[5].pct, 5); // $4 of $1000 is 0.4% but never vanishes
  assert.equal(m.bars?.[6].pct, 0);
  assert.equal(m.title, '$2,854 in.');
});

test('"best week since" only when an earlier week proves it', () => {
  // This week (Oct 26 - Nov 1) = 1000; the week of Aug 10 had 1500.
  const payments = [{ amount: 1000, paid_at: at(9, 28) }, { amount: 1500, paid_at: at(7, 12) }];
  const nov2 = new Date(2026, 10, 2, 8);
  const m = buildRecap({ now: nov2, kind: 'weekly', mode: 'auto', payments, open: [], signed: [] });
  assert.equal(m.title, '$1,000 in. Best week since August.');
  const none = buildRecap({ now: nov2, kind: 'weekly', mode: 'auto', payments: [{ amount: 1000, paid_at: at(9, 28) }], open: [], signed: [] });
  assert.equal(none.title, '$1,000 in.');
});

test('weekBars of an empty week is all zero with no peak', () => {
  const bars = weekBars([], new Date(2026, 10, 2));
  assert.ok(bars.every((b) => b.pct === 0 && !b.best));
});

test('automatic recaps: daily after 7:00 once a day, weekly Monday only', () => {
  assert.deepEqual(recapsDue(new Date(2026, 10, 7, 6, 59), {}), []);
  assert.deepEqual(recapsDue(fri, {}), ['daily']);
  assert.deepEqual(recapsDue(fri, { daily: '2026-11-07' }), []);
  assert.deepEqual(recapsDue(mon, {}), ['daily', 'weekly']);
  assert.deepEqual(recapsDue(mon, { daily: '2026-11-09', weekly: '2026-11-09' }), []);
  assert.deepEqual(recapsDue(new Date(2026, 10, 10, 9), { daily: '2026-11-09' }), ['daily']);
});

test('a recap of nothing is empty', () => {
  assert.equal(isEmptyRecap({ moneyIn: 0, owed: 0, overdue: 0, signed: 0 }), true);
  assert.equal(isEmptyRecap({ moneyIn: 0, owed: 10, overdue: 0, signed: 0 }), false);
});

test('the recap questions are narrow', () => {
  assert.equal(matchRecap('How did today go?'), 'daily');
  assert.equal(matchRecap("How'd I do this week?"), 'weekly');
  assert.equal(matchRecap('how’d i do this week'), 'weekly');
  assert.equal(matchRecap('Invoice Ruth $50 for how did today go'), null);
  assert.equal(matchRecap('how did today go with the Smith job'), null);
  assert.equal(matchRecap(''), null);
});
