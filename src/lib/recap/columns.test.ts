// The columns + ribbon opener (RECAP-SPEC §5, decision 6): weekly = 7 day
// columns; monthly = 4–5 calendar-week columns (Mon–Sun, clipped to the
// month), for every opener checkpoint case.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, CEILING, MAXH, STUB_H, buildColumns, calendarWeeks, columnsAmp, monthColumns, openerSeries, payloadColumns } from './columns';
import { addDays } from './dates';
import { fixturePayload, onePaymentWeek, scenarioPayload } from './fixtures';
import { slideCounts } from './timing';

test('calendar weeks: Mon–Sun, clipped to the month (before merging)', () => {
  // Sep 2026 starts on a Tuesday: Tue 1–Sun 6, 7–13, 14–20, 21–27, Mon 28–Wed 30.
  assert.deepEqual(calendarWeeks('2026-09-01', '2026-09-30').map((w) => [w.start, w.end, w.days]), [
    ['2026-09-01', '2026-09-06', 6], ['2026-09-07', '2026-09-13', 7], ['2026-09-14', '2026-09-20', 7],
    ['2026-09-21', '2026-09-27', 7], ['2026-09-28', '2026-09-30', 3],
  ]);
  const daily = Array.from({ length: 30 }, (_, i) => i + 1);
  assert.deepEqual(calendarWeeks('2026-09-01', '2026-09-30', daily).map((w) => w.amount), [21, 70, 119, 168, 87]);
});

test('month columns: a first/last week of ≤ 3 days merges into its neighbour (Sep 28–30 → 21–30)', () => {
  assert.deepEqual(monthColumns('2026-09-01', '2026-09-30').map((w) => [w.start, w.end, w.days]), [
    ['2026-09-01', '2026-09-06', 6], ['2026-09-07', '2026-09-13', 7], ['2026-09-14', '2026-09-20', 7],
    ['2026-09-21', '2026-09-30', 10],
  ]);
  // Sunday-start 31-day month (Aug 2027): 1 | 2–8 | 9–15 | 16–22 | 23–29 | 30–31 → both edges merge → 4.
  assert.deepEqual(monthColumns('2027-08-01', '2027-08-31').map((w) => [w.start, w.end]), [
    ['2027-08-01', '2027-08-08'], ['2027-08-09', '2027-08-15'], ['2027-08-16', '2027-08-22'], ['2027-08-23', '2027-08-31'],
  ]);
  // A 4-day edge stays its own column (Oct 2026: Thu 1–Sun 4).
  assert.equal(monthColumns('2026-10-01', '2026-10-31')[0].days, 4);
  // Feb 2027 starts on a Monday: exactly 4 full weeks, nothing to merge.
  assert.equal(monthColumns('2027-02-01', '2027-02-28').length, 4);
});

test('every month shape (28–31 days × each starting weekday) gives 4 or 5 columns, never 6, no edge ≤ 3 days', () => {
  // 2026-06-01 is a Monday; step through 7 consecutive start days.
  for (let s = 0; s < 7; s++) {
    for (const len of [28, 29, 30, 31]) {
      const start = addDays('2026-06-01', s);
      const cols = monthColumns(start, addDays(start, len - 1));
      assert.ok(cols.length === 4 || cols.length === 5, `${start} +${len}: ${cols.length}`);
      assert.ok(cols[0].days > 3 && cols[cols.length - 1].days > 3, `${start} +${len}: short edge`);
      assert.equal(cols.reduce((a, c) => a + c.days, 0), len);
    }
  }
});

test('a merged column longer than a week counts at its 7-day rate; shorter edges keep their total', () => {
  // Sep 2026 with $100 every day: 1–6 = 600 (6 days, kept), weeks = 700, 21–30 = 1000 × 7/10 = 700.
  const p = { kind: 'month' as const, start: '2026-09-01', end: '2026-09-30', daily: Array(30).fill(100), previous: null };
  assert.deepEqual(openerSeries(p).values, [600, 700, 700, 700]);
});

test('weekly: 7 day columns, 30 px; monthly: one 52 px column per (merged) calendar week', () => {
  const w = buildColumns(openerSeries(fixturePayload('normalWeek'))).cols;
  assert.equal(w.length, 7);
  assert.equal(w[0].w, 30);
  const m = buildColumns(openerSeries(fixturePayload('busyMonth'))).cols;
  assert.equal(m.length, 4);
  assert.ok(m.every((c) => c.w === 52));
  assert.ok(Math.abs(m[0].x - 28) < 1e-9 && Math.abs(m[3].x + m[3].w - 365) < 1e-6);
  assert.equal(slideCounts('opener', fixturePayload('busyMonth')).cols, 4);
  assert.equal(slideCounts('opener', fixturePayload('normalWeek')).cols, 7);
});

test('zero columns are stubs, never invisible; real ones are ≥ 14 px', () => {
  const { cols } = buildColumns({ values: [0, 450, 0, 800, 5, 0, 200], ref: 1600 / 7, wide: false });
  for (const c of cols) assert.ok(c.h > 0);
  assert.deepEqual(cols.filter((c) => c.zero).map((c) => c.h), [STUB_H, STUB_H, STUB_H]);
  assert.ok(cols.filter((c) => !c.zero).every((c) => c.h >= 14));
});

test('scaled against previous: amp = 0.4 + 0.6 × min(1, avg column / ref); none → 0.75', () => {
  assert.equal(columnsAmp([100, 100], null), 0.75);
  assert.equal(columnsAmp([100, 100], 200), 0.4 + 0.6 * 0.5);
  assert.equal(columnsAmp([100, 100], 100), 1);
});

test('monthly ref = previous month income ÷ ITS columns (Aug 2026: 6 calendar weeks → 4 after merging)', () => {
  const s = openerSeries(fixturePayload('quietMonth'));   // previous income 8000
  assert.equal(s.ref, 8000 / 4);
  const w = openerSeries(fixturePayload('normalWeek'));
  assert.equal(w.ref, fixturePayload('normalWeek').previous!.income / 7);
});

test('quiet month stands clearly lower than a busy month', () => {
  const tallest = (id: 'busyMonth' | 'quietMonth') => Math.max(...payloadColumns(fixturePayload(id)).cols.map((c) => c.h));
  assert.ok(tallest('busyMonth') >= 0.99 * MAXH);
  assert.ok(tallest('quietMonth') < 0.6 * MAXH, `quiet month tallest ${tallest('quietMonth')}`);
});

test('spiky month: a spike per week; the merged last week (21–30) counts at its 7-day rate', () => {
  // days 5:2400 11:150 18:3100 26:180 28:1900 → 1–6, 7–13, 14–20, 21–30 (10 days: 2080 × 7/10)
  const s = openerSeries(fixturePayload('spikyMonth'));
  assert.deepEqual(s.values.map((v) => Math.round(v)), [2400, 150, 3100, 1456]);
  const c = payloadColumns(fixturePayload('spikyMonth')).cols;
  assert.equal(c[2].h, MAXH);                       // the 3100 week is the tallest
  assert.ok(c[1].h < 0.15 * MAXH);                   // the $150 week stays small
  assert.ok(c[3].h < c[0].h && c[3].h > c[1].h);
});

test('busy month: every week paid, so no stubs', () => {
  assert.ok(payloadColumns(fixturePayload('busyMonth')).cols.every((c) => !c.zero));
});

test('$0 week: every column a stub, the ribbon low and flat', () => {
  const c = payloadColumns(fixturePayload('quietWeek'));
  assert.ok(c.cols.every((x) => x.zero && x.h === STUB_H));
  const ys = [0, 0.25, 0.5, 0.75, 1].map((f) => c.pointAt(f).y);
  assert.ok(Math.max(...ys) - Math.min(...ys) < 0.5);
});

test('one-payment week: one tall column, six stubs', () => {
  const c = payloadColumns(scenarioPayload(onePaymentWeek));
  assert.equal(c.cols.filter((x) => !x.zero).length, 1);
  assert.equal(c.cols.filter((x) => x.zero).length, 6);
});

test('nothing reaches above CEILING (the SE fit reference), weekly or monthly', () => {
  for (const id of ['busyMonth', 'spikyMonth', 'normalWeek'] as const) {
    const c = payloadColumns(fixturePayload(id));
    for (const f of [0, 0.2, 0.4, 0.6, 0.8, 1]) assert.ok(c.pointAt(f).y > CEILING, `${id} ribbon at ${f}`);
    assert.ok(c.top >= BASE - MAXH);
  }
});

test('screen mapping: x × kx, y → oy + y × ky; the hand-off point (85 %) is on screen', () => {
  for (const id of ['normalWeek', 'busyMonth'] as const) {
    const p = fixturePayload(id);
    const a = payloadColumns(p), b = payloadColumns(p, 1, 0.5, 426);
    assert.equal(b.cols[2].x, a.cols[2].x);
    assert.equal(b.base, 426 + BASE * 0.5);
    assert.equal(b.cols[2].h, a.cols[2].h * 0.5);
    const h = a.pointAt(0.85);
    assert.ok(h.x > 200 && h.x < 393 && h.y < BASE && h.y > CEILING, `${id} ${JSON.stringify(h)}`);
  }
});

test('payload stores previous { income, expenses }; nothing new for the weeks', () => {
  const p = fixturePayload('quietMonth');
  assert.deepEqual(p.previous, { income: 8000, expenses: 7000 });
  assert.equal(p.daily.length, 30);
  assert.equal(fixturePayload('nothing').previous, null);
});

test('Month at a glance uses the opener weeks (same buckets, same merge rule)', () => {
  for (const id of ['busyMonth', 'quietMonth', 'spikyMonth'] as const) {
    const p = fixturePayload(id);
    assert.equal(slideCounts('glance', p).bars, slideCounts('opener', p).cols);
    assert.deepEqual(monthColumns(p.start, p.end, p.daily).map((w) => w.days), [6, 7, 7, 10]);
  }
});
