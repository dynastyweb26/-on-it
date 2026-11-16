// The recap story's data: one stored payload per recap snapshot (recaps.payload),
// built once by the cron so the numbers never shift when the story is reopened.
// Shape and slide rules: RECAP-SPEC.md §1 and §7. Pure (no server-only imports):
// the cron (lib/notify/recaps) feeds it rows it has already range-filtered, and
// the unit tests feed it the prototype's eight scenarios.
//
// Money rules match Books / the Summary PDFs:
//   • income = invoice_payments (invoices only, not deleted), bucketed by the
//     owner's local day of paid_at;
//   • collected (redesign) = income + the other_income rows Books counts, so the
//     story's Collected number is the Books tab's, by construction;
//   • net (Kept) = collected − spend, and the daily series counts the same
//     other income on its local day, so every slide uses the Books basis;
//   • spend  = non-deleted expenses by spent_on, rolled up by summarize();
//   • still owed = sent/overdue invoices, max(0, total − amount_paid), AS OF
//     the build (not period-bound), the same formula as the Books tile.
import { summarize } from '@/lib/tax-summary';
import { isExpenseCategory } from '@/lib/expenses';
import { roundCurrency } from '@/lib/financials';
import { booksDay } from '@/lib/books-period';
import { countsAsIncome } from '@/lib/other-income';
import { isEntitledSlot } from './quota';
import { daysBetween, localYmd, type RecapKind, type RecapPeriod } from './dates';

/** Stays 1. Every field this build added is optional when read, and net, daily
 *  and previous already existed, so a payload stored before them opens and shows
 *  the numbers it was built with. Bump only when an existing field would be
 *  misread by this build; rows.playable() gates on this number. */
export const RECAP_PAYLOAD_VERSION = 1;
export const TOP_CATEGORIES = 4;   // the rest fold into "other" (5 data colours)
export const LIST_MAX = 3;         // owed / paid cards, receipts
export const TRIPS_MAX = 12;       // trip bars under "Most of it at …"
export const NAME_MAX = 120;       // matches clients.name / expenses.vendor caps

export const PAYMENT_METHODS = ['zelle', 'cashapp', 'card', 'bank', 'paypal', 'venmo', 'cash', 'check', 'other'] as const;
export type PaymentMethodKey = (typeof PAYMENT_METHODS)[number];

// ── Inputs (rows as the cron reads them) ─────────────────────────────
type Num = number | string;
export type RecapPaymentRow = { amount: Num; paid_at: string; method: string | null; client_name: string | null };
export type RecapExpenseRow = { amount: Num; category: string | null; vendor: string | null; spent_on: string };
/** A sent/overdue invoice. sent_at = coalesce(sent_at, first_sent_at). */
export type RecapOwedRow = { client_name: string | null; total: Num; amount_paid: Num | null; viewed_at: string | null; sent_at: string | null };
/** An invoice whose status is paid and whose paid_at falls in the period. */
export type RecapPaidRow = { client_name: string | null; total: Num; paid_at: string };
/** One other_income row — the non-invoice money Collected counts (Books rule). */
export type RecapOtherIncomeRow = {
  amount: Num;
  received_on: string;
  client_name: string | null;
  classification?: string | null;
  deleted_at?: string | null;
};

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
  /** Other money received (optional: older callers and fixtures have none). */
  otherIncome?: RecapOtherIncomeRow[];
  /** first_sent_at of the owner's live invoices (a later re-send never counts). */
  sentInvoices?: (string | null)[];
  /** approved_at of the owner's live estimates. */
  estimatesApproved?: (string | null)[];
};

// ── Output (stored as recaps.payload) ────────────────────────────────
export type RecapInvoiceItem = { client: string; amount: number; status: 'viewed' | 'sent' | 'paid'; date: string };

export type RecapPayload = {
  v: typeof RECAP_PAYLOAD_VERSION;
  kind: RecapKind;
  start: string;                 // local yyyy-mm-dd, inclusive
  end: string;
  income: { total: number; payments: number; clients: number };
  /** The Books "Collected" number, composed here so the story and the Books
   *  tab cannot disagree: invoice payments + the other_income rows Books counts.
   *  Optional on read: payloads stored before the redesign do not have it. */
  collected?: RecapCollected;
  spend: {
    total: number;
    count: number;
    categories: { key: string; amount: number }[];                        // ≤ 4 + "other", desc ("other" last)
    receipts: { vendor: string | null; amount: number; category: string }[]; // ≤ 3 largest
    /** Categories folded past the four named ones ("+2 more"). */
    moreCategories?: number;
  };
  /** Invoices first sent inside the period (local days). */
  invoicesSent?: number;
  /** Estimates approved inside the period (local days). */
  estimatesApproved?: number;
  /** Kept, on the Books basis: collected.total − spend.total. */
  net: number;
  change: { prevNet: number; pct: number; direction: 'up' | 'down' | 'flat' } | null;
  /** The previous period's totals as stored (null = unknown). `income` sets the
   *  opener horizon's height: this period's daily average against last
   *  period's (RECAP-SPEC §5 opener). Added with the opener; still v1, since no
   *  payload had been stored in production yet. */
  previous: { income: number; expenses: number } | null;
  daily: number[];               // collected (invoices + other income) per local day: 7 (week) or 28–31 (month)
  /** This owner's 0-based recap number, fixed when the row is built. The player
   *  passes it to pickAffirmation as periodIndex, so a recap's line never changes.
   *  Optional on read: payloads stored before it fall back to 0. */
  recapIndex?: number;
  /** 1 or 2: which of the two free recaps this row is (quota.ts slots, rules
   *  unchanged). Only a free-plan row that owns a slot has it. Optional on read. */
  freeRecapNumber?: number;
  /** The tallest day of daily — the day the peak label sits over. Earliest on
   *  a tie; null when every day is $0. Optional on read: payloads stored before
   *  it have none, and the player skips the label. */
  peakDay?: { amount: number; index: number } | null;
  /** By money collected in the period (invoice payments + other income with a
   *  client name); ties broken by name. pct is of collected.total. */
  topClient: { name: string; amount: number; pct?: number; invoiceCount?: number } | null;
  topVendor: { name: string; amount: number; category: string; tripCount: number; trips: number[] } | null;
  paymentMethods: { method: PaymentMethodKey; amount: number }[]; // desc, > 0 only
  owed: { total: number; count: number; invoices: RecapInvoiceItem[] };  // ≤ 3 largest
  viewedUnpaid: number;
  quotesPending: number;
  paid: { total: number; count: number; invoices: RecapInvoiceItem[] };  // ≤ 3 largest
};

export type RecapCollected = {
  total: number;      // collected_total
  invoices: number;   // invoices_paid_total
  other: number;      // other_received_total
  payments: number;   // money-in rows: payments + counted other income
  clients: number;
};

/** What buildRecapPayload always writes. Stored payloads from before the
 *  redesign read as RecapPayload, where these fields stay optional — so an old
 *  recap opens, and the player skips what it cannot fill. */
export type BuiltRecapPayload = RecapPayload & {
  collected: RecapCollected;
  peakDay: { amount: number; index: number } | null;
  invoicesSent: number;
  estimatesApproved: number;
  spend: RecapPayload['spend'] & { moreCategories: number };
  topClient: { name: string; amount: number; pct: number; invoiceCount: number } | null;
};

// ── The Books basis, shared by the story and the cron ────────────────
/** One counted other_income row, filed on the local day Books files it. */
export type RecapOtherIncomeDay = { day: string; amount: number; client_name: string | null };

/** The other_income rows Collected counts (income classification, never
 *  soft-deleted, positive), each on its local day of received_on. One rule for
 *  the daily series, the top client and the previous-period totals. */
export function otherIncomeInPeriod(rows: RecapOtherIncomeRow[], period: RecapPeriod, tz: string): RecapOtherIncomeDay[] {
  const out: RecapOtherIncomeDay[] = [];
  for (const r of rows) {
    if (r.deleted_at) continue;
    if (r.classification != null && !countsAsIncome(r.classification)) continue;
    const amount = num(r.amount);
    if (!(amount > 0)) continue;
    const day = booksDay('other_income', r.received_on, tz);
    if (day < period.start || day > period.end) continue;
    out.push({ day, amount, client_name: r.client_name ?? null });
  }
  return out;
}

/** A period's totals on the story's basis — the Books basis: invoice payments +
 *  counted other income in, expenses out. The previous period uses it too, so
 *  the change chip compares like with like. */
export function periodTotals(input: {
  invoiceIncome: number;
  expenses: number;
  otherIncome?: RecapOtherIncomeRow[];
  period: RecapPeriod;
  tz: string;
}): { income: number; expenses: number; net: number } {
  const other = otherIncomeInPeriod(input.otherIncome ?? [], input.period, input.tz)
    .reduce((sum, r) => sum + r.amount, 0);
  const income = r2(input.invoiceIncome + other);
  const expenses = r2(input.expenses);
  return { income, expenses, net: r2(income - expenses) };
}

/** The next recap number in one build run: every row the owner already has,
 *  plus the rows this run has already assigned one to. Counting all rows (no
 *  period filter) and numbering in-loop is what stops a week and a month built
 *  in the same run — or a month and a week of the same span — sharing a number. */
export function nextRecapIndex(run: { existing: number; thisRun: number }): number {
  const intact = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);
  return intact(run.existing) + intact(run.thisRun);
}

/** The two numbers the player needs that are not in the story's own figures,
 *  stored beside the payload when the row is built:
 *    recapIndex      — how many of the owner's recaps came before this one (0-based),
 *                      which is pickAffirmation's periodIndex;
 *    freeRecapNumber — which free recap this is (1..FREE_RECAPS) for a free-plan
 *                      row that owns a slot, straight from quota.ts's rule. */
export function playerFields(input: {
  earlierRecaps: number;
  freeSlot?: number | null;
}): { recapIndex: number; freeRecapNumber?: number } {
  const earlier = Number.isFinite(input.earlierRecaps) ? Math.floor(input.earlierRecaps) : 0;
  return {
    recapIndex: Math.max(0, earlier),
    ...(isEntitledSlot(input.freeSlot) ? { freeRecapNumber: input.freeSlot as number } : {}),
  };
}

/** The largest day of a daily series (earliest on a tie), or null when every
 *  day is $0 — the same day peakIndex() puts the peak label over. */
export function peakDayOf(daily: number[]): { amount: number; index: number } | null {
  let best: { amount: number; index: number } | null = null;
  daily.forEach((amount, index) => {
    const value = r2(amount);
    if (value > 0 && (!best || value > best.amount)) best = { amount: value, index };
  });
  return best;
}

/** The invoices-sent input: first_sent_at only. A later re-send must not move
 *  the count, and a row that was never sent is not one. */
export const sentInvoiceStamps = (rows: { first_sent_at?: string | null }[]): (string | null)[] =>
  rows.map((r) => r.first_sent_at ?? null);

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
/** How many of these instants land on a local day inside the period. */
const countTimestamps = (at: (string | null)[], tz: string, inRange: (day: string) => boolean) => {
  let n = 0;
  for (const iso of at) {
    if (!iso) continue;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) continue;
    if (inRange(localYmd(tz, date))) n += 1;
  }
  return n;
};

export function buildRecapPayload(input: RecapInput): BuiltRecapPayload {
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
  // Other money received: the rows Books counts, on their own local days — the
  // same rows that set Collected, the daily series and the top client. Money
  // with no client name is Collected, not a client.
  const byClientCollected = new Map<string, { name: string; amount: number }>();
  for (const [name, amount] of byClient) byClientCollected.set(name.toLowerCase(), { name, amount });
  let otherReceived = 0;
  let otherRows = 0;
  for (const r of otherIncomeInPeriod(input.otherIncome ?? [], period, tz)) {
    otherReceived += r.amount;
    otherRows += 1;
    daily[daysBetween(period.start, r.day)] += r.amount;
    const name = String(r.client_name ?? '').trim().slice(0, NAME_MAX);
    if (!name) continue;
    const k = name.toLowerCase();
    const cur = byClientCollected.get(k) ?? { name, amount: 0 };
    cur.amount += r.amount;
    byClientCollected.set(k, cur);
  }

  // Top client by money collected; equal money is settled by name, so the same
  // period always names the same client.
  let topClientName: { name: string; amount: number } | null = null;
  for (const c of byClientCollected.values()) {
    if (!topClientName || c.amount > topClientName.amount
      || (c.amount === topClientName.amount && c.name.localeCompare(topClientName.name) < 0)) {
      topClientName = { name: c.name, amount: c.amount };
    }
  }

  // Spend: summarize() for the category keys/rollup (same as Books), then fold.
  const expenses = input.expenses.filter((e) => inRange(e.spent_on));
  const spend = summarize(expenses.map((e) => ({ amount: e.amount, category: e.category ?? '' })));
  const named = spend.rows.filter((r) => r.category !== 'other').slice(0, TOP_CATEGORIES);
  const folded = spend.total - named.reduce((s, r) => s + r.total, 0);
  const categories = named.map((r) => ({ key: r.category as string, amount: r2(r.total) }));
  if (r2(folded) > 0) categories.push({ key: 'other', amount: r2(folded) });
  const moreCategories = Math.max(0, new Set(expenses.map((e) => categoryKey(e.category))).size - named.length);

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
  const otherTotal = r2(otherReceived);
  const collectedTotal = r2(incomeTotal + otherTotal);
  // Kept follows Books: what was collected (invoices + other income) minus spent.
  const net = r2(collectedTotal - spendTotal);

  // Invoices paid per client in the period (the top client's "N invoices").
  const paidByClient = new Map<string, number>();
  for (const item of paidItems) {
    const k = item.client.toLowerCase();
    paidByClient.set(k, (paidByClient.get(k) ?? 0) + 1);
  }
  const topClient: BuiltRecapPayload['topClient'] = topClientName ? {
    name: topClientName.name,
    amount: r2(topClientName.amount),
    pct: collectedTotal > 0 ? Math.round((topClientName.amount / collectedTotal) * 100) : 0,
    invoiceCount: paidByClient.get(topClientName.name.toLowerCase()) ?? 0,
  } : null;

  return {
    v: RECAP_PAYLOAD_VERSION,
    kind: period.kind,
    start: period.start,
    end: period.end,
    income: { total: incomeTotal, payments, clients: byClient.size },
    collected: {
      total: collectedTotal,
      invoices: incomeTotal,
      other: otherTotal,
      payments: payments + otherRows,
      clients: byClientCollected.size,
    },
    spend: { total: spendTotal, count: spend.count, categories, receipts, moreCategories },
    invoicesSent: countTimestamps(input.sentInvoices ?? [], tz, inRange),
    estimatesApproved: countTimestamps(input.estimatesApproved ?? [], tz, inRange),
    net,
    change: changeVs(net, input.previous),
    previous: input.previous ? { income: r2(num(input.previous.income)), expenses: r2(num(input.previous.expenses)) } : null,
    daily: daily.map(r2),
    peakDay: peakDayOf(daily),
    topClient,
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

/** Money in on the Books basis: Collected when the payload has it, else the
 *  invoice income alone, which is all a payload stored before it carries. */
const collectedIn = (p: Pick<RecapPayload, 'income' | 'collected'>) => p.collected?.total ?? p.income.total;

export function recapFlags(p: Pick<RecapPayload, 'income' | 'collected' | 'spend' | 'net' | 'owed' | 'paid'>): RecapFlags {
  // Collected, not invoice income: a week whose only money was other income is
  // a normal week, never "Quiet week" or a nothing-at-all period.
  const inTotal = collectedIn(p);
  const nothing = inTotal === 0 && p.spend.total === 0 && p.owed.count === 0 && p.paid.count === 0;
  return {
    nothing,
    quiet: !nothing && inTotal === 0,
    investment: !nothing && p.spend.total > 0 && p.net < 0,
    caughtUp: !nothing && p.owed.count === 0,
  };
}

export type RecapSlide =
  | 'opener' | 'moneyIn' | 'moneyInZero' | 'moneyOut' | 'kept' | 'keptInvest'
  | 'glance' | 'owed' | 'caughtUp' | 'quiet';

/** The prototype's R.sequence, plus two guards it doesn't need with its
 *  fixtures: no kept slide when nothing moved ($0 in and $0 out, but invoices
 *  owed or paid), and no month-at-a-glance for a month with $0 in. "$0 in"
 *  means Collected — other income is money in, so it earns both slides. */
export function recapSequence(p: RecapPayload): RecapSlide[] {
  const f = recapFlags(p);
  if (f.nothing) return ['quiet'];
  const inTotal = collectedIn(p);
  const s: RecapSlide[] = ['opener', f.quiet ? 'moneyInZero' : 'moneyIn'];
  if (p.spend.total > 0) s.push('moneyOut');
  if (inTotal > 0 || p.spend.total > 0) s.push(p.net >= 0 && inTotal > 0 ? 'kept' : 'keptInvest');
  if (p.kind === 'month' && inTotal > 0) s.push('glance');
  s.push(f.caughtUp ? 'caughtUp' : 'owed');
  return s;
}

/** The redesign's slide order (design keys(), RULES 9–12). 'bank' and 'waiting'
 *  are deliberately absent: they wait for the tiers work (RULE 7). */
export type RedesignSlide =
  | 'opener' | 'glance' | 'in' | 'out' | 'kept' | 'inv' | 'client' | 'free' | 'aff' | 'quiet';

export type RedesignPlan = 'free' | 'pro';

/** The slides the redesign player shows, in order (RULE 9).
 *  - nothing at all → the quiet slide, then the affirmation (RULE 10);
 *  - in, out, kept and inv always show, zero states included, and a loss week
 *    still uses kept (RULE 11);
 *  - client only with a named top client, free only on the free plan;
 *  - a month keeps the old opener and the glance, then in … aff (RULE 12). */
export function redesignSequence(p: RecapPayload, ctx: { plan: RedesignPlan }): RedesignSlide[] {
  if (recapFlags(p).nothing) return ['quiet', 'aff'];
  const k: RedesignSlide[] = p.kind === 'month' ? ['opener', 'glance'] : ['opener'];
  k.push('in', 'out', 'kept', 'inv');
  if (slidesWithData(p).includes('topClient')) k.push('client');
  // Free only on the free plan AND only for a row that owns one of the two
  // free recaps (quota.ts's slots): a locked or pro row has no free slide.
  if (ctx.plan === 'free' && isEntitledSlot(p.freeRecapNumber)) k.push('free');
  k.push('aff');
  return k;
}

/** The redesign's slides that have data in this payload. A payload stored
 *  before a field existed lists fewer, so the player skips those slides instead
 *  of drawing one empty. Money slides need money; a named top client needs one. */
export type RecapDataSlide = 'collectedSplit' | 'invoicesSent' | 'estimatesApproved' | 'topClient';

export function slidesWithData(p: RecapPayload): RecapDataSlide[] {
  const out: RecapDataSlide[] = [];
  const c = p.collected;
  if (c && r2(c.invoices) + r2(c.other) > 0) out.push('collectedSplit');
  if ((p.invoicesSent ?? 0) > 0) out.push('invoicesSent');
  if ((p.estimatesApproved ?? 0) > 0) out.push('estimatesApproved');
  if (p.topClient && p.topClient.amount > 0) out.push('topClient');
  return out;
}

/** Whether this recap earns a push and the in-app "Your week is ready" prompt. */
export const recapAnnounces = (p: RecapPayload) => !recapFlags(p).nothing;

