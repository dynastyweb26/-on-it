// The recap story's data: one stored payload per recap snapshot (recaps.payload),
// built once by the cron so the numbers never shift when the story is reopened.
// Shape and slide rules: RECAP-SPEC.md §1 and §7. Pure (no server-only imports):
// the cron (lib/notify/recaps) feeds it rows it has already range-filtered, and
// the unit tests feed it the prototype's eight scenarios.
//
// Money rules match Books / the Summary PDFs:
//   • income = invoice_payments (invoices only, not deleted), bucketed by the
//     owner's local day of paid_at;
//   • spend  = non-deleted expenses by spent_on, rolled up by summarize();
//   • still owed = sent/overdue invoices, max(0, total − amount_paid), AS OF
//     the build (not period-bound), the same formula as the Books tile.
import { summarize } from '@/lib/tax-summary';
import { isExpenseCategory } from '@/lib/expenses';
import { roundCurrency } from '@/lib/financials';
import { addDays, daysBetween, localYmd, type RecapKind, type RecapPeriod } from './dates';

export const RECAP_PAYLOAD_VERSION = 1;
export const TOP_CATEGORIES = 4;   // the rest fold into "other" (5 data colours)
export const LIST_MAX = 3;         // owed / paid cards, receipts
export const TRIPS_MAX = 12;       // trip bars under "Most of it at …"
export const NAME_MAX = 120;       // matches clients.name / expenses.vendor caps

export const PAYMENT_METHODS = ['zelle', 'cashapp', 'card', 'cash', 'check', 'other'] as const;
export type PaymentMethodKey = (typeof PAYMENT_METHODS)[number];

// ── Inputs (rows as the cron reads them) ─────────────────────────────
type Num = number | string;
export type RecapPaymentRow = { amount: Num; paid_at: string; method: string | null; client_name: string | null };
export type RecapExpenseRow = { amount: Num; category: string | null; vendor: string | null; spent_on: string };
/** A sent/overdue invoice. sent_at = coalesce(sent_at, first_sent_at). */
export type RecapOwedRow = { client_name: string | null; total: Num; amount_paid: Num | null; viewed_at: string | null; sent_at: string | null };
/** An invoice whose status is paid and whose paid_at falls in the period. */
export type RecapPaidRow = { client_name: string | null; total: Num; paid_at: string };

export type RecapInput = {
  period: RecapPeriod;
  tz: string;
  payments: RecapPaymentRow[];
  expenses: RecapExpenseRow[];
  owed: RecapOwedRow[];
  paid: RecapPaidRow[];
  quotesPending: number;
  /** The previous period's totals, for the change chip (null = unknown). */
  previous: { income: number; expenses: number } | null;
};

// ── Output (stored as recaps.payload) ────────────────────────────────
export type RecapInvoiceItem = { client: string; amount: number; status: 'viewed' | 'sent' | 'paid'; date: string };

export type RecapPayload = {
  v: typeof RECAP_PAYLOAD_VERSION;
  kind: RecapKind;
  start: string;                 // local yyyy-mm-dd, inclusive
  end: string;
  income: { total: number; payments: number; clients: number };
  spend: {
    total: number;
    count: number;
    categories: { key: string; amount: number }[];                        // ≤ 4 + "other", desc ("other" last)
    receipts: { vendor: string | null; amount: number; category: string }[]; // ≤ 3 largest
  };
  net: number;
  change: { prevNet: number; pct: number; direction: 'up' | 'down' | 'flat' } | null;
  daily: number[];               // income per local day: 7 (week) or 28–31 (month)
  topClient: { name: string; amount: number } | null;
  topVendor: { name: string; amount: number; category: string; tripCount: number; trips: number[] } | null;
  paymentMethods: { method: PaymentMethodKey; amount: number }[]; // desc, > 0 only
  owed: { total: number; count: number; invoices: RecapInvoiceItem[] };  // ≤ 3 largest
  viewedUnpaid: number;
  quotesPending: number;
  paid: { total: number; count: number; invoices: RecapInvoiceItem[] };  // ≤ 3 largest
};

const num = (v: Num | null | undefined) => Number(v) || 0;
const r2 = roundCurrency;
const cleanName = (s: string | null | undefined, fallback: string) => {
  const t = String(s ?? '').trim().slice(0, NAME_MAX);
  return t || fallback;
};
const categoryKey = (c: string | null) => (isExpenseCategory(c) ? c : 'other');
const methodKey = (m: string | null): PaymentMethodKey =>
  (PAYMENT_METHODS as readonly string[]).includes(m ?? '') ? (m as PaymentMethodKey) : 'other';
const byAmountDesc = <T extends { amount: number }>(a: T, b: T) => b.amount - a.amount;

export function buildRecapPayload(input: RecapInput): RecapPayload {
  const { period, tz } = input;
  const days = daysBetween(period.start, period.end) + 1;
  const inRange = (day: string) => day >= period.start && day <= period.end;

  // Income: by local day, client and method.
  const daily = new Array<number>(days).fill(0);
  const byClient = new Map<string, number>();
  const byMethod = new Map<PaymentMethodKey, number>();
  let income = 0;
  let payments = 0;
  for (const p of input.payments) {
    const day = localYmd(tz, new Date(p.paid_at));
    if (!inRange(day)) continue;
    const amt = num(p.amount);
    income += amt;
    payments += 1;
    daily[daysBetween(period.start, day)] += amt;
    const client = cleanName(p.client_name, 'Client');
    byClient.set(client, (byClient.get(client) ?? 0) + amt);
    const m = methodKey(p.method);
    byMethod.set(m, (byMethod.get(m) ?? 0) + amt);
  }
  let topClient: RecapPayload['topClient'] = null;
  for (const [name, amount] of byClient) if (!topClient || amount > topClient.amount) topClient = { name, amount };

  // Spend: summarize() for the category keys/rollup (same as Books), then fold.
  const expenses = input.expenses.filter((e) => inRange(e.spent_on));
  const spend = summarize(expenses.map((e) => ({ amount: e.amount, category: e.category ?? '' })));
  const named = spend.rows.filter((r) => r.category !== 'other').slice(0, TOP_CATEGORIES);
  const folded = spend.total - named.reduce((s, r) => s + r.total, 0);
  const categories = named.map((r) => ({ key: r.category as string, amount: r2(r.total) }));
  if (r2(folded) > 0) categories.push({ key: 'other', amount: r2(folded) });

  const receipts = expenses
    .map((e, i) => ({ i, vendor: String(e.vendor ?? '').trim().slice(0, NAME_MAX) || null, amount: num(e.amount), category: categoryKey(e.category), day: e.spent_on }))
    .sort((a, b) => b.amount - a.amount || a.day.localeCompare(b.day) || a.i - b.i)
    .slice(0, LIST_MAX)
    .map(({ vendor, amount, category }) => ({ vendor, amount: r2(amount), category }));

  // Top store across all categories; its trips in date order.
  type V = { name: string; amount: number; trips: { day: string; amount: number }[]; byCat: Map<string, number> };
  const vendors = new Map<string, V>();
  for (const e of expenses) {
    const name = String(e.vendor ?? '').trim().slice(0, NAME_MAX);
    if (!name) continue;
    const k = name.toLowerCase();
    const v: V = vendors.get(k) ?? { name, amount: 0, trips: [], byCat: new Map() };
    const amt = num(e.amount);
    v.amount += amt;
    v.trips.push({ day: e.spent_on, amount: amt });
    const c = categoryKey(e.category);
    v.byCat.set(c, (v.byCat.get(c) ?? 0) + amt);
    vendors.set(k, v);
  }
  let best: V | null = null;
  for (const v of vendors.values()) if (!best || v.amount > best.amount) best = v;
  let topVendor: RecapPayload['topVendor'] = null;
  if (best) {
    let cat = 'other';
    let catAmt = -1;
    for (const [c, a] of best.byCat) if (a > catAmt) { cat = c; catAmt = a; }
    const trips = best.trips.slice().sort((a, b) => a.day.localeCompare(b.day));
    topVendor = {
      name: best.name,
      amount: r2(best.amount),
      category: cat,
      tripCount: trips.length,
      trips: trips.slice(0, TRIPS_MAX).map((t) => r2(t.amount)),
    };
  }

  // Still on the table (as of the build).
  const owedRows = input.owed
    .map((o) => ({ o, balance: Math.max(0, num(o.total) - num(o.amount_paid)) }))
    .filter((x) => r2(x.balance) > 0);
  const owedItems: RecapInvoiceItem[] = owedRows
    .map(({ o, balance }) => ({
      client: cleanName(o.client_name, 'Client'),
      amount: r2(balance),
      status: o.viewed_at ? 'viewed' as const : 'sent' as const,
      date: o.sent_at ? localYmd(tz, new Date(o.sent_at)) : '',
    }))
    .sort(byAmountDesc);

  const paidItems: RecapInvoiceItem[] = input.paid
    .map((p) => ({ client: cleanName(p.client_name, 'Client'), amount: r2(num(p.total)), status: 'paid' as const, date: localYmd(tz, new Date(p.paid_at)) }))
    .filter((p) => inRange(p.date))
    .sort(byAmountDesc);

  const incomeTotal = r2(income);
  const spendTotal = r2(spend.total);
  const net = r2(incomeTotal - spendTotal);

  return {
    v: RECAP_PAYLOAD_VERSION,
    kind: period.kind,
    start: period.start,
    end: period.end,
    income: { total: incomeTotal, payments, clients: byClient.size },
    spend: { total: spendTotal, count: spend.count, categories, receipts },
    net,
    change: changeVs(net, input.previous),
    daily: daily.map(r2),
    topClient: topClient ? { name: topClient.name, amount: r2(topClient.amount) } : null,
    topVendor,
    paymentMethods: [...byMethod].map(([method, amount]) => ({ method, amount: r2(amount) }))
      .filter((m) => m.amount > 0).sort(byAmountDesc),
    owed: { total: r2(owedItems.reduce((s, x) => s + x.amount, 0)), count: owedItems.length, invoices: owedItems.slice(0, LIST_MAX) },
    viewedUnpaid: owedItems.filter((x) => x.status === 'viewed').length,
    quotesPending: Math.max(0, Math.floor(input.quotesPending || 0)),
    paid: { total: r2(paidItems.reduce((s, x) => s + x.amount, 0)), count: paidItems.length, invoices: paidItems.slice(0, LIST_MAX) },
  };
}

/** "Up 18% from last week". Only meaningful against a positive previous net;
 *  otherwise null and the chip is hidden. */
export function changeVs(net: number, previous: RecapInput['previous']): RecapPayload['change'] {
  if (!previous) return null;
  const prevNet = r2(previous.income - previous.expenses);
  if (!(prevNet > 0)) return null;
  const pct = Math.round((Math.abs(net - prevNet) / prevNet) * 100);
  return { prevNet, pct, direction: pct === 0 ? 'flat' : net > prevNet ? 'up' : 'down' };
}

// ── Hard-week flags and the slide order ──────────────────────────────
export type RecapFlags = {
  /** Nothing in, nothing out, nothing owed, nothing paid: one "Quiet week." card, no push, no prompt. */
  nothing: boolean;
  /** $0 in (but something else happened): the calm Money in slide. */
  quiet: boolean;
  /** Spent more than came in: the investment-week kept slide (no ring, no glow). */
  investment: boolean;
  /** Nothing owed: the "You're all caught up." slide. */
  caughtUp: boolean;
};

export function recapFlags(p: Pick<RecapPayload, 'income' | 'spend' | 'net' | 'owed' | 'paid'>): RecapFlags {
  const nothing = p.income.total === 0 && p.spend.total === 0 && p.owed.count === 0 && p.paid.count === 0;
  return {
    nothing,
    quiet: !nothing && p.income.total === 0,
    investment: !nothing && p.spend.total > 0 && p.net < 0,
    caughtUp: !nothing && p.owed.count === 0,
  };
}

export type RecapSlide =
  | 'opener' | 'moneyIn' | 'moneyInZero' | 'moneyOut' | 'kept' | 'keptInvest'
  | 'glance' | 'owed' | 'caughtUp' | 'quiet';

/** The prototype's R.sequence, plus two guards it doesn't need with its
 *  fixtures: no kept slide when nothing moved ($0 in and $0 out, but invoices
 *  owed or paid), and no month-at-a-glance for a month with $0 in. */
export function recapSequence(p: RecapPayload): RecapSlide[] {
  const f = recapFlags(p);
  if (f.nothing) return ['quiet'];
  const s: RecapSlide[] = ['opener', f.quiet ? 'moneyInZero' : 'moneyIn'];
  if (p.spend.total > 0) s.push('moneyOut');
  if (p.income.total > 0 || p.spend.total > 0) s.push(p.net >= 0 && p.income.total > 0 ? 'kept' : 'keptInvest');
  if (p.kind === 'month' && p.income.total > 0) s.push('glance');
  s.push(f.caughtUp ? 'caughtUp' : 'owed');
  return s;
}

/** Whether this recap earns a push and the in-app "Your week is ready" prompt. */
export const recapAnnounces = (p: RecapPayload) => !recapFlags(p).nothing;

// ── Month buckets (glance slide; the columns opener for a month) ─────
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 1–7, 8–14, 15–21, 22–end, from the per-day series ("Sep 22–30"). */
export function monthWeeks(p: Pick<RecapPayload, 'start' | 'daily'>): { label: string; start: string; amount: number }[] {
  const mon = MON[Number(p.start.slice(5, 7)) - 1];
  const n = p.daily.length;
  return [[0, 7], [7, 14], [14, 21], [21, n]].map(([a, b]) => ({
    label: `${mon} ${a + 1}–${b}`,
    start: addDays(p.start, a),
    amount: r2(p.daily.slice(a, b).reduce((s, x) => s + x, 0)),
  }));
}
