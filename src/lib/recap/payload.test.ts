import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRecapPayload, changeVs, monthWeeks, recapAnnounces, recapFlags, recapSequence,
  TRIPS_MAX, type RecapInput, type RecapSlide,
} from './payload';
import { FIXTURE_TZ, fixturePayload, getScenario, INVOICE_COUNTS, SCENARIOS, type ScenarioId } from './fixtures';
import { addDays, periodsEndingBefore, previousPeriod, zonedMidnight } from './dates';

const IDS = Object.keys(SCENARIOS) as ScenarioId[];
const key = (name: string) => name.toLowerCase();

// The prototype's R.sequence for each scenario (player.js), unchanged by our guards.
const EXPECTED_SEQUENCE: Record<ScenarioId, RecapSlide[]> = {
  normalWeek: ['opener', 'moneyIn', 'moneyOut', 'kept', 'owed'],
  quietWeek: ['opener', 'moneyInZero', 'moneyOut', 'keptInvest', 'owed'],
  investmentWeek: ['opener', 'moneyIn', 'moneyOut', 'keptInvest', 'owed'],
  caughtUp: ['opener', 'moneyIn', 'moneyOut', 'kept', 'caughtUp'],
  nothing: ['quiet'],
  busyMonth: ['opener', 'moneyIn', 'moneyOut', 'kept', 'glance', 'owed'],
  quietMonth: ['opener', 'moneyIn', 'moneyOut', 'kept', 'glance', 'owed'],
  spikyMonth: ['opener', 'moneyIn', 'moneyOut', 'kept', 'glance', 'owed'],
};

const EXPECTED_FLAGS: Record<ScenarioId, { nothing: boolean; quiet: boolean; investment: boolean; caughtUp: boolean }> = {
  normalWeek: { nothing: false, quiet: false, investment: false, caughtUp: false },
  quietWeek: { nothing: false, quiet: true, investment: true, caughtUp: false },
  investmentWeek: { nothing: false, quiet: false, investment: true, caughtUp: false },
  caughtUp: { nothing: false, quiet: false, investment: false, caughtUp: true },
  nothing: { nothing: true, quiet: false, investment: false, caughtUp: false },
  busyMonth: { nothing: false, quiet: false, investment: false, caughtUp: false },
  quietMonth: { nothing: false, quiet: false, investment: false, caughtUp: false },
  spikyMonth: { nothing: false, quiet: false, investment: false, caughtUp: false },
};

// ── The eight prototype scenarios through the real builder ───────────
for (const id of IDS) {
  test(`scenario ${id}: flags and slide order match the prototype`, () => {
    const p = fixturePayload(id);
    assert.deepEqual(recapFlags(p), EXPECTED_FLAGS[id]);
    assert.deepEqual(recapSequence(p), EXPECTED_SEQUENCE[id]);
    assert.equal(recapAnnounces(p), id !== 'nothing'); // nothing-at-all: snapshot only, no push, no prompt
  });

  test(`scenario ${id}: payload numbers match the scenario`, () => {
    const s = getScenario(id);
    const p = fixturePayload(id);
    assert.equal(p.kind, s.period);
    assert.equal(p.income.total, s.income.total);
    assert.deepEqual(p.daily, s.daily);
    assert.equal(p.daily.length, s.period === 'month' ? 30 : 7);
    assert.equal(p.spend.total, s.spend.total);
    assert.deepEqual(p.spend.categories, s.spend.categories.map((c) => ({ key: key(c.name), amount: c.amount })));
    assert.equal(p.net, s.net);
    assert.equal(p.owed.total, s.owed.total);
    assert.equal(p.owed.count, s.owed.invoices.length);
    assert.deepEqual(p.owed.invoices.map((i) => [i.client, i.amount, i.status]),
      s.owed.invoices.slice().sort((a, b) => b.amount - a.amount).slice(0, 3).map((i) => [i.client, i.amount, i.status]));
    assert.equal(p.viewedUnpaid, s.viewedUnpaid);
    assert.equal(p.quotesPending, s.quotesPending);
    assert.equal(p.paid.count, s.paidInvoices.length);
    if (s.topVendor) {
      assert.deepEqual(
        { name: p.topVendor?.name, amount: p.topVendor?.amount, category: p.topVendor?.category, trips: p.topVendor?.trips, tripCount: p.topVendor?.tripCount },
        { name: s.topVendor.name, amount: s.topVendor.amount, category: key(s.topVendor.category), trips: s.topVendor.trips, tripCount: s.topVendor.trips.length });
    } else {
      assert.equal(p.topVendor, null);
    }
    if (s.net > 0 && s.change.net.direction !== 'flat') {
      assert.deepEqual([p.change?.direction, p.change?.pct], [s.change.net.direction, s.change.net.pct]);
    } else {
      assert.equal(p.change, null); // no positive previous net → chip hidden
    }
    if (s.weeks) assert.deepEqual(monthWeeks(p).map((w) => [w.label, w.amount]), s.weeks.map((w) => [w.label, w.amount]));
  });
}

test('normal week: top client, clients, payments and methods', () => {
  const p = fixturePayload('normalWeek');
  assert.deepEqual(p.income, { total: 1850, payments: 4, clients: 3 });
  assert.deepEqual(p.topClient, { name: 'Mike Davis', amount: 1250 });
  assert.deepEqual(p.paymentMethods, [{ method: 'zelle', amount: 1000 }, { method: 'card', amount: 450 }, { method: 'cashapp', amount: 400 }]);
  assert.equal(p.spend.receipts.length, 3);
  assert.equal(p.spend.receipts[0].amount, 58);
  assert.equal(p.spend.receipts[0].vendor, 'Home Depot');
  assert.equal(p.paid.total, 1850);
  assert.deepEqual(p.paid.invoices.map((i) => i.amount), [800, 450, 400]);
});

test('investment week: top client', () => {
  assert.deepEqual(fixturePayload('investmentWeek').topClient, { name: 'Sarah Lee', amount: 400 });
});

for (const n of INVOICE_COUNTS) {
  test(`invoice count ${n}: owed list capped at 3, count and viewed carried`, () => {
    const s = getScenario('normalWeek', n);
    const p = fixturePayload('normalWeek', n);
    assert.equal(p.owed.count, n);
    assert.equal(p.owed.invoices.length, Math.min(3, n));
    assert.equal(p.owed.total, s.owed.total);
    assert.equal(p.viewedUnpaid, s.viewedUnpaid);
    assert.deepEqual(recapSequence(p).at(-1), 'owed');
  });
  test(`invoice count ${n}: caught-up bundle capped at 3, count carried`, () => {
    const p = fixturePayload('caughtUp', n);
    assert.equal(p.paid.count, n);
    assert.equal(p.paid.invoices.length, Math.min(3, n));
    assert.ok(p.paid.invoices.every((i, k, a) => k === 0 || a[k - 1].amount >= i.amount));
    assert.deepEqual(recapSequence(p).at(-1), 'caughtUp');
  });
}

// ── Builder edge cases ───────────────────────────────────────────────
const WEEK = { kind: 'week' as const, start: '2026-09-21', end: '2026-09-27' };
const base = (over: Partial<RecapInput> = {}): RecapInput => ({
  period: WEEK, tz: FIXTURE_TZ, payments: [], expenses: [], owed: [], paid: [], quotesPending: 0, previous: null, ...over,
});

test('income is bucketed by the owner\'s local day, rows outside the period are dropped', () => {
  const p = buildRecapPayload(base({
    payments: [
      // 03:00 UTC Monday Sep 28 = 22:00 Sunday Sep 27 in Chicago → last day of the week
      { amount: 100, paid_at: '2026-09-28T03:00:00Z', method: 'zelle', client_name: 'A' },
      // 05:30 UTC Monday Sep 21 = 00:30 Monday in Chicago → first day
      { amount: 50, paid_at: '2026-09-21T05:30:00Z', method: 'cash', client_name: 'B' },
      // 04:30 UTC Monday Sep 21 = 23:30 Sunday Sep 20 → previous week, dropped
      { amount: 999, paid_at: '2026-09-21T04:30:00Z', method: 'zelle', client_name: 'C' },
    ],
    expenses: [
      { amount: 10, category: 'fuel', vendor: 'Shell', spent_on: '2026-09-27' },
      { amount: 99, category: 'fuel', vendor: 'Shell', spent_on: '2026-09-28' }, // next week
    ],
  }));
  assert.deepEqual(p.daily, [50, 0, 0, 0, 0, 0, 100]);
  assert.deepEqual(p.income, { total: 150, payments: 2, clients: 2 });
  assert.equal(p.spend.total, 10);
  assert.equal(p.net, 140);
});

test('categories: top 4 named, the rest (and "other") fold into "other", last', () => {
  const cats = ['food', 'fuel', 'supplies', 'tools', 'travel', 'maintenance', 'phone', 'other'];
  const p = buildRecapPayload(base({
    expenses: [
      ...cats.map((c, i) => ({ amount: 100 - i * 10, category: c, vendor: null, spent_on: WEEK.start })),
      { amount: 5, category: 'not-a-category', vendor: null, spent_on: WEEK.start },
    ],
  }));
  assert.deepEqual(p.spend.categories, [
    { key: 'food', amount: 100 }, { key: 'fuel', amount: 90 }, { key: 'supplies', amount: 80 }, { key: 'tools', amount: 70 },
    { key: 'other', amount: 60 + 50 + 40 + 30 + 5 },
  ]);
  assert.equal(p.spend.count, 9);
  assert.equal(p.topVendor, null); // no vendors at all
});

test('top store: across all categories, case-insensitive, trips in date order and capped', () => {
  const trips = Array.from({ length: TRIPS_MAX + 3 }, (_, i) => ({ amount: 10 + i, category: 'supplies', vendor: i % 2 ? 'home depot' : 'Home Depot', spent_on: addDays(WEEK.start, i % 7) }));
  const p = buildRecapPayload(base({ expenses: [...trips, { amount: 150, category: 'tools', vendor: 'Ace', spent_on: WEEK.start }] }));
  assert.equal(p.topVendor?.name, 'Home Depot');
  assert.equal(p.topVendor?.category, 'supplies');
  assert.equal(p.topVendor?.tripCount, TRIPS_MAX + 3);
  assert.equal(p.topVendor?.trips.length, TRIPS_MAX);
  assert.equal(p.topVendor?.amount, trips.reduce((s, t) => s + t.amount, 0));
});

test('still owed: balance after partial payments, settled rows dropped, viewed counted', () => {
  const p = buildRecapPayload(base({
    owed: [
      { client_name: 'A', total: 1000, amount_paid: 400, viewed_at: '2026-09-25T15:00:00Z', sent_at: '2026-09-24T15:00:00Z' },
      { client_name: 'B', total: '300.50', amount_paid: null, viewed_at: null, sent_at: '2026-09-26T15:00:00Z' },
      { client_name: 'C', total: 200, amount_paid: 200, viewed_at: '2026-09-26T15:00:00Z', sent_at: null },
    ],
  }));
  assert.deepEqual(p.owed, {
    total: 900.5, count: 2,
    invoices: [
      { client: 'A', amount: 600, status: 'viewed', date: '2026-09-24' },
      { client: 'B', amount: 300.5, status: 'sent', date: '2026-09-26' },
    ],
  });
  assert.equal(p.viewedUnpaid, 1);
});

test('names are trimmed and capped; blanks fall back', () => {
  const long = 'x'.repeat(200);
  const p = buildRecapPayload(base({
    payments: [{ amount: 10, paid_at: '2026-09-22T15:00:00Z', method: 'venmo', client_name: `  ${long}  ` }],
    owed: [{ client_name: '   ', total: 5, amount_paid: 0, viewed_at: null, sent_at: null }],
  }));
  assert.equal(p.topClient?.name.length, 120);
  assert.equal(p.owed.invoices[0].client, 'Client');
  assert.deepEqual(p.paymentMethods, [{ method: 'other', amount: 10 }]); // unknown method → other
});

test('change chip: only against a positive previous net', () => {
  assert.equal(changeVs(500, null), null);
  assert.equal(changeVs(500, { income: 100, expenses: 100 }), null);
  assert.equal(changeVs(500, { income: 0, expenses: 50 }), null);
  assert.deepEqual(changeVs(1180, { income: 1000, expenses: 0 }), { prevNet: 1000, pct: 18, direction: 'up' });
  assert.deepEqual(changeVs(780, { income: 1200, expenses: 200 }), { prevNet: 1000, pct: 22, direction: 'down' });
  assert.deepEqual(changeVs(1000, { income: 1000, expenses: 0 }), { prevNet: 1000, pct: 0, direction: 'flat' });
  assert.deepEqual(changeVs(-200, { income: 400, expenses: 0 }), { prevNet: 400, pct: 150, direction: 'down' });
});

test('only invoices owed ($0 in, $0 out): no kept slide; not "nothing"', () => {
  const p = buildRecapPayload(base({ owed: [{ client_name: 'A', total: 100, amount_paid: 0, viewed_at: null, sent_at: null }] }));
  assert.deepEqual(recapFlags(p), { nothing: false, quiet: true, investment: false, caughtUp: false });
  assert.deepEqual(recapSequence(p), ['opener', 'moneyInZero', 'owed']);
  assert.equal(recapAnnounces(p), true);
});

test('a month with $0 in skips the glance slide', () => {
  const p = buildRecapPayload(base({
    period: { kind: 'month', start: '2026-02-01', end: '2026-02-28' },
    expenses: [{ amount: 40, category: 'fuel', vendor: 'Shell', spent_on: '2026-02-10' }],
  }));
  assert.equal(p.daily.length, 28);
  assert.deepEqual(recapSequence(p), ['opener', 'moneyInZero', 'moneyOut', 'keptInvest', 'caughtUp']);
  assert.deepEqual(monthWeeks(p).map((w) => w.label), ['Feb 1–7', 'Feb 8–14', 'Feb 15–21', 'Feb 22–28']);
});

test('payload stays small: the worst case is well under the 16 KB column cap', () => {
  const name = 'y'.repeat(120);
  const p = buildRecapPayload(base({
    period: { kind: 'month', start: '2026-10-01', end: '2026-10-31' },
    payments: Array.from({ length: 500 }, (_, i) => ({ amount: 1234.56, paid_at: zonedMidnight(addDays('2026-10-01', i % 31), FIXTURE_TZ).toISOString(), method: 'card', client_name: name + i })),
    expenses: Array.from({ length: 500 }, (_, i) => ({ amount: 99.99, category: 'tools', vendor: name, spent_on: addDays('2026-10-01', i % 31) })),
    owed: Array.from({ length: 200 }, () => ({ client_name: name, total: 5000, amount_paid: 0, viewed_at: null, sent_at: '2026-10-02T15:00:00Z' })),
    paid: Array.from({ length: 200 }, () => ({ client_name: name, total: 5000, paid_at: '2026-10-02T15:00:00Z' })),
    previous: { income: 1, expenses: 0 },
  }));
  assert.ok(JSON.stringify(p).length < 4096, `payload is ${JSON.stringify(p).length} bytes`);
});

// ── Periods ──────────────────────────────────────────────────────────
test('periods: Monday → previous week; the 1st → previous month; previousPeriod', () => {
  assert.deepEqual(periodsEndingBefore('2026-09-28'), [{ kind: 'week', start: '2026-09-21', end: '2026-09-27' }]);
  assert.deepEqual(periodsEndingBefore('2026-10-01'), [{ kind: 'month', start: '2026-09-01', end: '2026-09-30' }]);
  assert.deepEqual(periodsEndingBefore('2026-09-29'), []);
  assert.deepEqual(previousPeriod({ kind: 'week', start: '2026-09-21', end: '2026-09-27' }), { kind: 'week', start: '2026-09-14', end: '2026-09-20' });
  assert.deepEqual(previousPeriod({ kind: 'month', start: '2026-03-01', end: '2026-03-31' }), { kind: 'month', start: '2026-02-01', end: '2026-02-28' });
  assert.deepEqual(previousPeriod({ kind: 'month', start: '2026-01-01', end: '2026-01-31' }), { kind: 'month', start: '2025-12-01', end: '2025-12-31' });
});
