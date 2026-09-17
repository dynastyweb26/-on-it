// ═══ Tax summary — period model + category rollup ═══
// A record of LOGGED EXPENSES grouped by category, over a chosen period.
//
// Granularity (week / month / quarter / year) and the specific period are
// SEPARATE concepts: the caller picks a granularity, then a specific bucket in
// it. Buckets are calendar-aligned — Q1 = Jan–Mar, weeks start Monday — because
// the reason a tradesperson cares about quarters is estimated-tax dates, which a
// rolling window can't serve. Buckets are only ever built from dates that carry
// records, so the UI never offers an empty period to scroll past.
//
// summarize() counts EVERYTHING and never filters on tax_deductible: that column
// defaults false and is user-toggled, so filtering on it would report ~$0.
// Deductibility is surfaced as an indicator only, never used to gate the count.
import { CATEGORY_LABEL, isExpenseCategory, type ExpenseCategory } from '@/lib/expenses';

export type Granularity = 'week' | 'month' | 'quarter' | 'year';

export interface Period {
  id: string;                        // stable, e.g. "all" | "2026" | "2026-Q3" | "2026-08" | "W-2026-08-03"
  granularity: Granularity | 'all';
  label: string;                     // literal, e.g. "August 2026", "Q3 2026", "2026", "All time"
  friendlyLabel: string;             // "This Month" for the current bucket; otherwise === label
  start: string;                     // yyyy-mm-dd, inclusive
  end: string;                       // yyyy-mm-dd, inclusive
}

export const GRANULARITY_OPTIONS: { g: Granularity; label: string }[] = [
  { g: 'week', label: 'Week' },
  { g: 'month', label: 'Month' },
  { g: 'quarter', label: 'Quarter' },
  { g: 'year', label: 'Year' },
];

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** The Monday-start week containing a local date, as [start, end] yyyy-mm-dd. */
function weekBounds(y: number, m: number, d: number): [string, string] {
  const dt = new Date(y, m - 1, d);
  const dow = (dt.getDay() + 6) % 7; // 0 = Mon … 6 = Sun
  const mon = new Date(y, m - 1, d - dow);
  const sun = new Date(y, m - 1, d - dow + 6);
  return [
    ymd(mon.getFullYear(), mon.getMonth() + 1, mon.getDate()),
    ymd(sun.getFullYear(), sun.getMonth() + 1, sun.getDate()),
  ];
}

/** The calendar bucket a given yyyy-mm-dd falls in, at the chosen granularity.
 *  friendlyLabel is "This Week/Month/Quarter/Year" when the bucket is the one
 *  `now` falls in, else the literal label. */
export function bucketFor(g: Granularity, iso: string, now = new Date()): Period {
  const [y, m, d] = iso.split('-').map(Number);
  const nowY = now.getFullYear();
  const nowM = now.getMonth() + 1;

  if (g === 'year') {
    const isCurrent = y === nowY;
    return { id: `${y}`, granularity: g, label: `${y}`, friendlyLabel: isCurrent ? 'This Year' : `${y}`, start: ymd(y, 1, 1), end: ymd(y, 12, 31) };
  }
  if (g === 'quarter') {
    const q = Math.floor((m - 1) / 3) + 1;
    const sm = (q - 1) * 3 + 1;
    const em = sm + 2;
    const lastDay = new Date(y, em, 0).getDate();
    const label = `Q${q} ${y}`;
    const isCurrent = y === nowY && Math.floor((nowM - 1) / 3) + 1 === q;
    return { id: `${y}-Q${q}`, granularity: g, label, friendlyLabel: isCurrent ? 'This Quarter' : label, start: ymd(y, sm, 1), end: ymd(y, em, lastDay) };
  }
  if (g === 'month') {
    const lastDay = new Date(y, m, 0).getDate();
    const label = `${MONTHS[m - 1]} ${y}`;
    const isCurrent = y === nowY && m === nowM;
    return { id: `${y}-${pad(m)}`, granularity: g, label, friendlyLabel: isCurrent ? 'This Month' : label, start: ymd(y, m, 1), end: ymd(y, m, lastDay) };
  }
  // week
  const [ws, we] = weekBounds(y, m, d);
  const [nows] = weekBounds(nowY, nowM, now.getDate());
  const [, wm, wd] = ws.split('-').map(Number);
  const label = `Week of ${MONTHS[wm - 1].slice(0, 3)} ${wd}`;
  const isCurrent = ws === nows;
  return { id: `W-${ws}`, granularity: g, label, friendlyLabel: isCurrent ? 'This Week' : label, start: ws, end: we };
}

/** Distinct buckets (most recent first) that actually contain records. */
export function availablePeriods(g: Granularity, dates: string[], now = new Date()): Period[] {
  const byId = new Map<string, Period>();
  for (const iso of dates) {
    if (!iso) continue;
    const p = bucketFor(g, iso, now);
    if (!byId.has(p.id)) byId.set(p.id, p);
  }
  return [...byId.values()].sort((a, b) => b.start.localeCompare(a.start));
}

/** The all-time period spanning every record (min … max), or today if none. */
export function allPeriod(dates: string[], now = new Date()): Period {
  const valid = dates.filter(Boolean).slice().sort();
  const today = ymd(now.getFullYear(), now.getMonth() + 1, now.getDate());
  return {
    id: 'all',
    granularity: 'all',
    label: 'All time',
    friendlyLabel: 'All time',
    start: valid[0] ?? today,
    end: valid[valid.length - 1] ?? today,
  };
}

export interface ExpenseLite {
  amount: number | string;
  category: string;
  tax_deductible?: boolean;
  spent_on?: string; // yyyy-mm-dd — used to bucket into periods
}

// ── Income (cash basis) ──────────────────────────────────────────────
// Income counts when an invoice is marked PAID, not when it is sent, so the
// number matches what actually landed in the bank. Outstanding (sent/overdue)
// is surfaced separately and never summed into net. Quotes and draft/void
// invoices are not money and are excluded upstream (query filter).
// A single payment from the invoice_payments ledger, with its invoice's client
// name embedded. Income is cash basis: it is these rows, bucketed by paid_at.
export interface PaymentLite {
  amount: number | string;
  paid_at?: string | null;     // timestamptz — when the cash arrived
  client_name: string;
}

// A sent/overdue invoice, for the as-of-now outstanding balance only.
export interface InvoiceLite {
  total: number | string;
  status: string;                    // 'sent' | 'overdue'
  amount_paid?: number | string | null;
}

export interface ClientTotal { client: string; count: number; total: number; }

export interface IncomeSummary {
  broughtIn: number;       // Σ ledger payments whose paid_at falls in the period (cash basis)
  stillOwed: number;       // as-of-now Σ max(0, total - amount_paid) over sent/overdue (not in net)
  byClient: ClientTotal[]; // in-period payments grouped by client, total desc
}

/** Local yyyy-mm-dd of an ISO timestamp (invoices store timestamptz), so it
 *  compares against the local period bounds the same way spent_on does. */
export function localDay(ts?: string | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  return isNaN(d.getTime()) ? '' : ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** Cash-basis income for a period. broughtIn and byClient come from the payments
 *  ledger, bucketed by each payment's paid_at, so a deposit and the balance land
 *  in whichever periods they were actually paid. stillOwed is a snapshot AS OF
 *  NOW — the unpaid remainder of every sent/overdue invoice — and is deliberately
 *  independent of the selected period. */
export function summarizeIncome(
  payments: PaymentLite[],
  outstanding: InvoiceLite[],
  period: Period,
): IncomeSummary {
  const inPeriod = (day: string) =>
    day !== '' && (period.granularity === 'all' || (day >= period.start && day <= period.end));

  let broughtIn = 0;
  const byClient = new Map<string, ClientTotal>();
  for (const p of payments) {
    if (!inPeriod(localDay(p.paid_at))) continue;
    const amt = Number(p.amount) || 0;
    broughtIn += amt;
    const name = p.client_name || 'Client';
    const cur = byClient.get(name) ?? { client: name, count: 0, total: 0 };
    cur.count += 1; // number of payments received, not invoices
    cur.total += amt;
    byClient.set(name, cur);
  }

  // As of now, ignore the period: the current unpaid balance of sent/overdue.
  let stillOwed = 0;
  for (const inv of outstanding) {
    stillOwed += Math.max(0, (Number(inv.total) || 0) - (Number(inv.amount_paid) || 0));
  }

  return { broughtIn, stillOwed, byClient: [...byClient.values()].sort((a, b) => b.total - a.total) };
}

export interface CategoryTotal {
  category: ExpenseCategory | 'other';
  label: string;
  count: number;
  total: number;
  anyDeductible: boolean; // for the optional on-screen indicator only
}

export interface Summary {
  total: number;
  count: number;
  rows: CategoryTotal[]; // sorted by total desc; zero-categories are absent
}

/** Group expenses by category, summing amount and counting rows. Categories
 *  with no expenses in the set are simply never added — never emitted as $0. */
export function summarize(expenses: ExpenseLite[]): Summary {
  const byCat = new Map<string, CategoryTotal>();
  let total = 0;
  let count = 0;

  for (const e of expenses) {
    const amt = Number(e.amount) || 0;
    total += amt;
    count += 1;

    const key = isExpenseCategory(e.category) ? e.category : 'other';
    const label = isExpenseCategory(e.category) ? CATEGORY_LABEL[e.category] : CATEGORY_LABEL.other;
    const cur = byCat.get(key) ?? { category: key, label, count: 0, total: 0, anyDeductible: false };
    cur.count += 1;
    cur.total += amt;
    cur.anyDeductible = cur.anyDeductible || Boolean(e.tax_deductible);
    byCat.set(key, cur);
  }

  const rows = [...byCat.values()].sort((a, b) => b.total - a.total);
  return { total, count, rows };
}
