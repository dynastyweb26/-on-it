// The approved prototype's eight scenarios (design-reference/recap-prototype.html,
// data.js; RECAP-SPEC.md §11), ported as test fixtures and, later, as the
// /dev/recap-preview data. `scenarioInput` turns a scenario into the raw rows
// the cron would read, so the real payload builder runs on them.
//
// The prototype's scenarios are hand-written and not all internally consistent
// (e.g. the monthly top client isn't one of the generated payments), so the
// tests assert only the fields each scenario's rows actually determine.
import { addDays, zonedMidnight, type RecapPeriod } from './dates';
import { buildRecapPayload, type RecapInput, type RecapPayload } from './payload';

type Inv = { id: string; client: string; amount: number; status: 'viewed' | 'sent' | 'paid'; date: string };
export type Scenario = {
  id: string;
  period: 'week' | 'month';
  income: { total: number; payments: number; clients: number };
  spend: { total: number; categories: { name: string; amount: number }[]; receipts: { vendor: string; amount: number; category: string }[] };
  net: number;
  change: { net: { pct: number; direction: 'up' | 'down' | 'flat'; vs: string } };
  daily: number[];
  topClient: { name: string; amount: number } | null;
  topVendor: { name: string; amount: number; category: string; trips: number[] } | null;
  paymentMethods: { method: string; amount: number }[];
  owed: { total: number; invoices: Inv[] };
  viewedUnpaid: number;
  quotesPending: number;
  paidInvoices: Inv[];
  weeks: { label: string; amount: number }[] | null;
  /** On It build (opener commit): the previous period's income, which sets the
   *  horizon's height. The prototype has no such field; when absent it's
   *  derived as previous net + this period's spend. Chosen so the change chip
   *  (previous net) is exactly what the prototype shows. */
  previousIncome?: number;
};

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const CLIENTS = ['Sarah Lee', 'James Ortiz', 'Tom Reyes', 'Ana Cruz', 'Ben Park', 'Lisa Chen', 'Dave Kim', 'Rosa Diaz', 'Mark Hill', 'Nina Shah', 'Paul Grant', 'Kim Nguyen', 'Luis Ortega', 'Amy Ford', 'Ray Cole', 'Jen Wu', 'Sam Price', 'Eva Long', 'Joe Burns', 'Tara Moss'];
const SETS: Record<number, number[]> = { 1: [1200], 3: [1200, 800, 400], 7: [900, 600, 350, 200, 150, 120, 80], 20: [1200, 800, 650, 420, 380, 350, 300, 280, 260, 240, 220, 200, 180, 160, 150, 140, 120, 110, 90, 80] };
const VIEWED: Record<number, number> = { 1: 1, 3: 2, 7: 4, 20: 11 };
export const INVOICE_COUNTS = [1, 3, 7, 20] as const;

function makeInvoices(n: number, paid = false): Inv[] {
  return SETS[n].map((amount, i) => ({
    id: 'INV-' + (1060 - i), client: CLIENTS[i], amount,
    status: paid ? 'paid' : (i < VIEWED[n] ? 'viewed' : 'sent'),
    date: '2026-09-' + String(28 - (i % 7)).padStart(2, '0'),
  }));
}
const owed = (invoices: Inv[]) => ({ total: sum(invoices.map((i) => i.amount)), invoices });

const normalWeek: Scenario = {
  id: 'normal-week', period: 'week',
  income: { total: 1850, payments: 4, clients: 3 },
  spend: {
    total: 214,
    categories: [{ name: 'Supplies', amount: 154 }, { name: 'Fuel', amount: 38 }, { name: 'Tools', amount: 22 }],
    receipts: [{ vendor: 'Home Depot', amount: 58, category: 'Supplies' }, { vendor: 'Shell', amount: 38, category: 'Fuel' }, { vendor: 'Ace Hardware', amount: 22, category: 'Tools' }],
  },
  net: 1636,
  change: { net: { pct: 18, direction: 'up', vs: 'last week' } },
  daily: [0, 450, 0, 800, 400, 0, 200],
  topClient: { name: 'Mike Davis', amount: 1250 },
  topVendor: { name: 'Home Depot', amount: 132, category: 'Supplies', trips: [58, 46, 28] },
  paymentMethods: [{ method: 'zelle', amount: 1000 }, { method: 'card', amount: 450 }, { method: 'cashapp', amount: 400 }],
  owed: owed(makeInvoices(3)),
  viewedUnpaid: 2, quotesPending: 1,
  paidInvoices: [
    { id: 'INV-1038', client: 'Mike Davis', amount: 800, status: 'paid', date: '2026-09-25' },
    { id: 'INV-1036', client: 'Mike Davis', amount: 450, status: 'paid', date: '2026-09-23' },
    { id: 'INV-1039', client: 'Sarah Lee', amount: 400, status: 'paid', date: '2026-09-26' },
    { id: 'INV-1041', client: 'Tom Reyes', amount: 200, status: 'paid', date: '2026-09-28' },
  ],
  weeks: null,
};

const quietWeek: Scenario = {
  ...normalWeek, id: 'quiet-week',
  income: { total: 0, payments: 0, clients: 0 },
  spend: { total: 86, categories: [{ name: 'Supplies', amount: 64 }, { name: 'Fuel', amount: 22 }],
    receipts: [{ vendor: 'Home Depot', amount: 64, category: 'Supplies' }, { vendor: 'Shell', amount: 22, category: 'Fuel' }] },
  net: -86, change: { net: { pct: 100, direction: 'down', vs: 'last week' } },
  daily: [0, 0, 0, 0, 0, 0, 0], topClient: null,
  topVendor: { name: 'Home Depot', amount: 64, category: 'Supplies', trips: [40, 24] },
  paymentMethods: [], paidInvoices: [],
  previousIncome: 1600, // after a normal week
};

const investmentWeek: Scenario = {
  ...normalWeek, id: 'investment-week',
  income: { total: 640, payments: 2, clients: 2 },
  spend: { total: 1120, categories: [{ name: 'Tools', amount: 780 }, { name: 'Supplies', amount: 280 }, { name: 'Fuel', amount: 60 }],
    receipts: [{ vendor: "Lowe's", amount: 780, category: 'Tools' }, { vendor: 'Home Depot', amount: 280, category: 'Supplies' }, { vendor: 'Shell', amount: 60, category: 'Fuel' }] },
  net: -480, change: { net: { pct: 38, direction: 'down', vs: 'last week' } },
  daily: [0, 0, 400, 0, 0, 240, 0],
  topClient: { name: 'Sarah Lee', amount: 400 },
  topVendor: { name: "Lowe's", amount: 780, category: 'Tools', trips: [780] },
  paymentMethods: [{ method: 'card', amount: 400 }, { method: 'zelle', amount: 240 }],
  previousIncome: 1600, // after a normal week: a lower horizon
};

const caughtUp: Scenario = { ...normalWeek, id: 'caught-up', owed: owed([]), viewedUnpaid: 0, quotesPending: 0 };

const nothing: Scenario = {
  ...normalWeek, id: 'nothing', income: { total: 0, payments: 0, clients: 0 }, spend: { total: 0, categories: [], receipts: [] }, net: 0,
  change: { net: { pct: 0, direction: 'flat', vs: 'last week' } }, daily: [0, 0, 0, 0, 0, 0, 0], topClient: null, topVendor: null,
  paymentMethods: [], owed: owed([]), viewedUnpaid: 0, quotesPending: 0, paidInvoices: [],
};

function month(id: string, daily: number[], o: {
  payments: number; clients: number; change: Scenario['change']['net'];
  categories: Scenario['spend']['categories']; receipts: Scenario['spend']['receipts'];
  topClient: Scenario['topClient']; topVendor: Scenario['topVendor'];
}): Scenario {
  const total = sum(daily);
  const weeks = ([[0, 7, 'Sep 1–7'], [7, 14, 'Sep 8–14'], [14, 21, 'Sep 15–21'], [21, 30, 'Sep 22–30']] as const)
    .map(([a, b, label]) => ({ label, amount: sum(daily.slice(a, b)) }));
  const zelle = Math.round(total * 0.48 / 10) * 10, card = Math.round(total * 0.33 / 10) * 10;
  const spend = sum(o.categories.map((c) => c.amount));
  return {
    id, period: 'month',
    income: { total, payments: o.payments, clients: o.clients },
    spend: { total: spend, categories: o.categories, receipts: o.receipts },
    net: total - spend,
    change: { net: o.change },
    daily, topClient: o.topClient, topVendor: o.topVendor,
    paymentMethods: [{ method: 'zelle', amount: zelle }, { method: 'card', amount: card }, { method: 'cashapp', amount: total - zelle - card }],
    owed: owed(makeInvoices(3)), viewedUnpaid: 2, quotesPending: 1, paidInvoices: normalWeek.paidInvoices, weeks,
  };
}

const busyMonth = month('busy-month', [0, 320, 0, 560, 0, 600, 0, 450, 0, 390, 0, 700, 250, 0, 0, 800, 0, 650, 450, 400, 0, 0, 450, 0, 800, 400, 0, 200, 0, 0], {
  payments: 17, clients: 9, change: { pct: 9, direction: 'up', vs: 'August' },
  categories: [{ name: 'Supplies', amount: 520 }, { name: 'Fuel', amount: 210 }, { name: 'Tools', amount: 130 }],
  receipts: [{ vendor: 'Home Depot', amount: 62, category: 'Supplies' }, { vendor: 'Shell', amount: 48, category: 'Fuel' }, { vendor: "Lowe's", amount: 130, category: 'Tools' }],
  topClient: { name: 'Mike Davis', amount: 3150 },
  topVendor: { name: 'Home Depot', amount: 410, category: 'Supplies', trips: [62, 48, 55, 40, 38, 52, 44, 36, 35] },
});
const quietMonth: Scenario = { ...month('quiet-month', [0, 0, 180, 0, 0, 0, 0, 0, 240, 0, 0, 0, 0, 0, 0, 150, 0, 0, 0, 0, 0, 320, 0, 0, 0, 0, 0, 0, 200, 0], {
  payments: 5, clients: 4, change: { pct: 22, direction: 'down', vs: 'August' },
  categories: [{ name: 'Supplies', amount: 180 }, { name: 'Fuel', amount: 130 }],
  receipts: [{ vendor: 'Home Depot', amount: 70, category: 'Supplies' }, { vendor: 'Shell', amount: 45, category: 'Fuel' }, { vendor: 'Home Depot', amount: 60, category: 'Supplies' }],
  topClient: { name: 'Sarah Lee', amount: 320 },
  topVendor: { name: 'Home Depot', amount: 180, category: 'Supplies', trips: [70, 60, 50] },
}), previousIncome: 8000 }; // after a normal August: a low horizon
const spikyMonth = month('spiky-month', [0, 0, 0, 0, 2400, 0, 0, 0, 0, 0, 150, 0, 0, 0, 0, 0, 0, 3100, 0, 0, 0, 0, 0, 0, 0, 180, 0, 1900, 0, 0], {
  payments: 6, clients: 4, change: { pct: 14, direction: 'up', vs: 'August' },
  categories: [{ name: 'Supplies', amount: 640 }, { name: 'Tools', amount: 420 }, { name: 'Fuel', amount: 180 }],
  receipts: [{ vendor: "Lowe's", amount: 420, category: 'Tools' }, { vendor: 'Home Depot', amount: 310, category: 'Supplies' }, { vendor: 'Shell', amount: 60, category: 'Fuel' }],
  topClient: { name: 'Ortiz Builders', amount: 3100 },
  topVendor: { name: 'Home Depot', amount: 640, category: 'Supplies', trips: [310, 190, 140] },
});

/** On It build (opener checkpoint), NOT one of the prototype's eight: a week
 *  with a single payment (one soft hill, the rest low). Kept out of SCENARIOS
 *  so the prototype-parity tests stay about the prototype. */
export const onePaymentWeek: Scenario = {
  ...normalWeek, id: 'one-payment-week',
  income: { total: 850, payments: 1, clients: 1 },
  net: 850 - normalWeek.spend.total,
  change: { net: { pct: 0, direction: 'flat', vs: 'last week' } },
  daily: [0, 0, 0, 850, 0, 0, 0],
  topClient: { name: 'Mike Davis', amount: 850 },
  paymentMethods: [{ method: 'zelle', amount: 850 }],
  paidInvoices: [{ id: 'INV-1038', client: 'Mike Davis', amount: 850, status: 'paid', date: '2026-09-25' }],
  previousIncome: 1600,
};

export const SCENARIOS = { normalWeek, quietWeek, investmentWeek, caughtUp, nothing, busyMonth, quietMonth, spikyMonth };
export type ScenarioId = keyof typeof SCENARIOS;
export const SCENARIO_LABELS: Record<ScenarioId, string> = {
  normalWeek: 'Normal week', quietWeek: 'Quiet week ($0 in)', investmentWeek: 'Investment week', caughtUp: 'Caught up', nothing: 'Nothing at all',
  busyMonth: 'Busy month', quietMonth: 'Quiet month', spikyMonth: 'Spiky month',
};

/** The prototype's getScenario: invoiceCount (1|3|7|20) replaces the unpaid
 *  list ("Still on the table") or, when nothing is owed, the paid list. */
export function getScenario(id: ScenarioId, invoiceCount?: number): Scenario {
  const d: Scenario = JSON.parse(JSON.stringify(SCENARIOS[id]));
  if (invoiceCount && SETS[invoiceCount]) {
    if (d.owed.invoices.length) { d.owed = owed(makeInvoices(invoiceCount)); d.viewedUnpaid = VIEWED[invoiceCount]; }
    else if (d.paidInvoices.length) d.paidInvoices = makeInvoices(invoiceCount, true);
  }
  return d;
}

// ── Scenario → the rows the cron would read ──────────────────────────
export const FIXTURE_TZ = 'America/Chicago';
const noon = (ymd: string) => new Date(zonedMidnight(ymd, FIXTURE_TZ).getTime() + 12 * 3600e3).toISOString();
const key = (name: string) => name.toLowerCase();

export function scenarioPeriod(s: Scenario): RecapPeriod {
  // The prototype's weekly label is Sep 22 – Sep 28; the month is September.
  return s.period === 'month'
    ? { kind: 'month', start: '2026-09-01', end: '2026-09-30' }
    : { kind: 'week', start: '2026-09-22', end: '2026-09-28' };
}

export function scenarioInput(s: Scenario): RecapInput {
  const period = scenarioPeriod(s);

  // Payments: Normal week's four payments are spelled out in the prototype
  // (dates, clients, methods all agree); elsewhere one payment per day with
  // income, the biggest day going to the top client.
  let payments: RecapInput['payments'];
  if (s.id === 'normal-week') {
    payments = [
      { day: 1, amount: 450, method: 'card', client: 'Mike Davis' },
      { day: 3, amount: 800, method: 'zelle', client: 'Mike Davis' },
      { day: 4, amount: 400, method: 'cashapp', client: 'Sarah Lee' },
      { day: 6, amount: 200, method: 'zelle', client: 'Tom Reyes' },
    ].map((p) => ({ amount: p.amount, paid_at: noon(addDays(period.start, p.day)), method: p.method, client_name: p.client }));
  } else {
    const peak = Math.max(0, ...s.daily);
    let n = 0;
    payments = s.daily.flatMap((amount, day) => amount > 0 ? [{
      amount,
      paid_at: noon(addDays(period.start, day)),
      method: s.paymentMethods[0]?.method ?? 'zelle',
      client_name: amount === peak && s.topClient ? s.topClient.name : `Client ${++n}`,
    }] : []);
  }

  // Expenses: the top store's trips, then each category's remainder at a
  // store of its own (always smaller than the top store in these scenarios).
  const expenses: RecapInput['expenses'] = [];
  const v = s.topVendor;
  if (v) v.trips.forEach((t, i) => expenses.push({ amount: t, category: key(v.category), vendor: v.name, spent_on: addDays(period.start, i) }));
  for (const c of s.spend.categories) {
    const rest = c.amount - (v && v.category === c.name ? v.amount : 0);
    if (rest > 0) expenses.push({ amount: rest, category: key(c.name), vendor: `${c.name} Depot`, spent_on: period.start });
  }

  const prevNet = s.net > 0 && s.change.net.direction !== 'flat'
    ? s.net / (1 + (s.change.net.direction === 'up' ? 1 : -1) * s.change.net.pct / 100)
    : 0;

  return {
    period,
    tz: FIXTURE_TZ,
    payments,
    expenses,
    owed: s.owed.invoices.map((i) => ({ client_name: i.client, total: i.amount, amount_paid: 0, viewed_at: i.status === 'viewed' ? noon(i.date) : null, sent_at: noon(i.date) })),
    paid: s.paidInvoices.map((i) => ({ client_name: i.client, total: i.amount, paid_at: noon(i.date) })),
    quotesPending: s.quotesPending,
    // Previous income (horizon height) with the previous NET kept exactly as
    // the prototype's change chip implies: expenses = income − prevNet.
    previous: (() => {
      const net = prevNet > 0 ? prevNet : 0;
      const income = s.previousIncome ?? (net > 0 ? net + s.spend.total : null);
      return income == null ? null : { income, expenses: income - net };
    })(),
  };
}

export const fixturePayload = (id: ScenarioId, invoiceCount?: number): RecapPayload =>
  buildRecapPayload(scenarioInput(getScenario(id, invoiceCount)));

/** Any scenario object (e.g. onePaymentWeek) through the real payload builder. */
export const scenarioPayload = (s: Scenario): RecapPayload => buildRecapPayload(scenarioInput(s));
