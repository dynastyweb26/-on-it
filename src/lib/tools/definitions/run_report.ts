// ═══ Tool · run_report (read) ═══
//
// One report, four card shapes. The money is booksTotals(), the same pure
// calculation the Books tab uses, so a report and Books cannot disagree for the
// same period. Periods use the owner's profile timezone; a week starts Monday,
// from the recap's weekBounds(), the same boundary the weekly recap uses.
//
// Outstanding is the one exception to "period": it is the live unpaid balance of
// sent/overdue invoices, so it is always reported as of now and says so.
//
// Client grouping also carries how long each client takes to pay: average days
// from first send to full payment, with the number of paid invoices behind it.
// A client with fewer than two paid invoices is not ranked as slow — the result
// says how many were left out.
import { z } from 'zod';
import { defineTool } from '../contract';
import {
  BreakdownProps,
  RankedListProps,
  StatTilesProps,
  TrendChartProps,
  type TrendPoint,
} from '@/lib/templates/props';
import { breakdownView } from '@/lib/templates/breakdown';
import { trendChartProps } from '@/lib/templates/trend';
import { rankedView } from '@/lib/templates/ranked';
import { booksTotals } from '@/lib/books-totals';
import { booksDay, inBooksPeriod } from '@/lib/books-period';
import { countsAsIncome, type OtherIncomeRow } from '@/lib/other-income';
import { CATEGORY_LABEL, isExpenseCategory } from '@/lib/expenses';
import {
  addDays,
  daysBetween,
  localYmd,
  previousPeriod,
  resolveTimeZone,
  weekBounds,
} from '@/lib/recap/dates';
import { roundCurrency } from '@/lib/financials';
import { MoneySchema, moneyField, moneyIn, moneyOut, type MoneyField } from '../money';
import {
  READ_CAP,
  forgivingCategory,
  matchOf,
  moneyText,
  normName,
  num,
  toIso,
} from '../read';

export const RUN_REPORT = 'run_report';

const METRICS = ['collected', 'spent', 'net', 'invoiced', 'outstanding'] as const;
const GROUPS = ['none', 'week', 'month', 'client', 'category'] as const;
const PERIODS = [
  'this_week', 'last_week', 'this_month', 'last_month', 'this_year', 'last_year', 'custom',
] as const;

type Metric = (typeof METRICS)[number];
type GroupBy = (typeof GROUPS)[number];
type PeriodName = (typeof PERIODS)[number];

export const RunReportInput = z
  .object({
    metric: z.string().max(20).optional(),
    period: z.string().max(20).optional(),
    from: z.string().max(10).optional(),
    to: z.string().max(10).optional(),
    group_by: z.string().max(20).optional(),
    category: z.string().max(60).optional(),
    compare: z.boolean().optional(),
    sort: z.string().max(20).optional(),
    limit: z.number().int().min(1).max(READ_CAP).optional(),
  })
  .strict();

const ClientStat = z.object({
  name: z.string(),
  total: z.string(),
  averageDaysToPay: z.number().int().nonnegative().nullable(),
  paidInvoices: z.number().int().nonnegative(),
});

export const RunReportOutput = z.object({
  match: z.enum(['none', 'one', 'many']),
  count: z.number().int().nonnegative(),
  ignored: z.array(z.string()),
  eyebrow: z.string().min(1),
  title: z.string(),
  metric: z.enum(METRICS),
  groupBy: z.enum(GROUPS),
  period: z.object({
    id: z.string(),
    label: z.string().min(1),
    start: z.string(),
    end: z.string(),
    timezone: z.string(),
  }),
  value: MoneySchema,
  comparison: z
    .object({
      previousLabel: z.string().min(1),
      previous: z.string(),
      previousAmount: z.number().finite(),
      previousZero: z.boolean(),
      dir: z.enum(['up', 'down', 'flat']),
      text: z.string().min(1),
    })
    .nullable(),
  tiles: StatTilesProps,
  trend: TrendChartProps,
  breakdown: BreakdownProps,
  rows: RankedListProps.shape.rows,
  totalCount: z.number().int().nonnegative(),
  total: RankedListProps.shape.total,
  hideTotal: z.boolean().optional(),
  clients: z.array(ClientStat),
  slowestExcluded: z.number().int().nonnegative(),
  slowestNote: z.string(),
  outstandingAsOf: z.literal('now'),
  outstandingNote: z.string(),
});

// ── Calendar ─────────────────────────────────────────────────────────────

export type ReportRange = {
  id: string;
  label: string;
  start: string;
  end: string;
  kind: 'week' | 'month' | 'year' | 'custom';
};

const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const monthBounds = (y: number, m: number): { start: string; end: string } => ({
  start: `${y}-${pad(m)}-01`,
  end: `${y}-${pad(m)}-${new Date(Date.UTC(y, m, 0)).getUTCDate()}`,
});

const shortDay = (day: string): string => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1))
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};

const weekLabel = (start: string) => `Week of ${shortDay(start)}`;
const weekFull = (start: string, end: string) => `${shortDay(start)} – ${shortDay(end)}`;

/** The period the request asked for, resolved against the caller's local today. */
export function resolveReportRange(
  period: PeriodName,
  today: string,
  from?: string,
  to?: string,
): { range: ReportRange; ignored: string[] } {
  const [y, m] = today.split('-').map(Number);

  if (period === 'custom') {
    const start = from?.trim() ?? '';
    const end = to?.trim() ?? '';
    if (ISO.test(start) && ISO.test(end) && !Number.isNaN(Date.parse(start)) && !Number.isNaN(Date.parse(end)) && start <= end) {
      return { range: { id: 'custom', label: `${start} – ${end}`, start, end, kind: 'custom' }, ignored: [] };
    }
    const fallback = monthBounds(y, m);
    return {
      range: { id: 'this_month', label: 'This month', ...fallback, kind: 'month' },
      ignored: ['custom period needs a valid from and to'],
    };
  }

  if (period === 'this_week') {
    const week = weekBounds(today);
    return { range: { id: period, label: weekLabel(week.start), start: week.start, end: week.end, kind: 'week' }, ignored: [] };
  }
  if (period === 'last_week') {
    const prev = previousPeriod(weekBounds(today));
    return { range: { id: period, label: weekLabel(prev.start), start: prev.start, end: prev.end, kind: 'week' }, ignored: [] };
  }
  if (period === 'this_month') {
    return { range: { id: period, label: 'This month', ...monthBounds(y, m), kind: 'month' }, ignored: [] };
  }
  if (period === 'last_month') {
    const pm = m === 1 ? 12 : m - 1;
    const py = m === 1 ? y - 1 : y;
    return { range: { id: period, label: 'Last month', ...monthBounds(py, pm), kind: 'month' }, ignored: [] };
  }
  if (period === 'this_year') {
    return { range: { id: period, label: 'This year', start: `${y}-01-01`, end: `${y}-12-31`, kind: 'year' }, ignored: [] };
  }
  return { range: { id: 'last_year', label: 'Last year', start: `${y - 1}-01-01`, end: `${y - 1}-12-31`, kind: 'year' }, ignored: [] };
}

function previousRange(range: ReportRange): ReportRange {
  if (range.kind === 'week') {
    return { ...range, id: 'previous', label: 'the previous week', start: addDays(range.start, -7), end: addDays(range.end, -7) };
  }
  if (range.kind === 'year') {
    const y = Number(range.start.slice(0, 4));
    return { ...range, id: 'previous', label: 'the previous year', start: `${y - 1}-01-01`, end: `${y - 1}-12-31` };
  }
  if (range.kind === 'month') {
    const [y, m] = range.start.split('-').map(Number);
    const pm = m === 1 ? 12 : m - 1;
    const py = m === 1 ? y - 1 : y;
    return { ...range, id: 'previous', label: 'the previous month', ...monthBounds(py, pm) };
  }
  const length = daysBetween(range.start, range.end) + 1;
  const end = addDays(range.start, -1);
  return { ...range, id: 'previous', label: 'the previous period', start: addDays(end, -(length - 1)), end };
}

// ── Rows ─────────────────────────────────────────────────────────────────

type RawInvoice = {
  id: string;
  kind: string | null;
  status: string;
  total: number | string | null;
  amount_paid: number | string | null;
  client_name: string | null;
  created_at: string | null;
  sent_at: string | null;
  first_sent_at: string | null;
  paid_at: string | null;
  deleted_at: string | null;
};

type RawPayment = {
  id: string;
  invoice_id: string;
  amount: number | string | null;
  paid_at: string | null;
  method: string | null;
  entry_type: string | null;
};

type RawOther = OtherIncomeRow & {
  id?: string;
  title?: string | null;
  client_name?: string | null;
  received_on?: string | null;
};

type RawExpense = {
  id: string;
  amount: number | string | null;
  category: string | null;
  spent_on: string | null;
  invoice_id: string | null;
  deleted_at: string | null;
};

type Invoice = {
  id: string;
  clientName: string;
  kind: string;
  status: string;
  total: number;
  amountPaid: number;
  issuedDay: string;
  sentDay: string;
  paidDay: string;
  deleted: boolean;
};

type Payment = { clientName: string; amount: number; day: string };
type Other = { clientName: string; amount: number; day: string };
type Expense = { clientName: string; amount: number; category: string; day: string };

const dayOf = (value: unknown, tz: string): string => {
  const iso = toIso(value);
  if (!iso) return '';
  if (ISO.test(iso)) return iso;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : localYmd(tz, date);
};

const inRange = (day: string, range: { start: string; end: string }) =>
  inBooksPeriod(day, range);

export type ReportData = {
  payments: Payment[];
  otherIncome: Other[];
  expenses: Expense[];
  invoices: Invoice[];
};

function metricLabel(metric: Metric): string {
  return {
    collected: 'Collected',
    spent: 'Spent',
    net: 'Net',
    invoiced: 'Invoiced',
    outstanding: 'Still owed',
  }[metric];
}

function metricMoney(metric: Metric, value: number): MoneyField {
  const amount = roundCurrency(value);
  if (metric === 'spent') return amount === 0 ? moneyField(0) : moneyOut(amount);
  if (metric === 'collected') {
    if (amount === 0) return moneyField(0);
    return amount < 0 ? moneyOut(amount) : moneyIn(amount);
  }
  if (metric === 'net') {
    if (amount === 0) return moneyField(0);
    return amount < 0 ? moneyOut(amount) : moneyIn(amount);
  }
  return moneyField(amount);
}

function collectedIn(data: ReportData, range: { start: string; end: string }): { value: number; count: number } {
  const payments = data.payments.filter((row) => inRange(row.day, range));
  const other = data.otherIncome.filter((row) => inRange(row.day, range));
  // Books owns the arithmetic; the report only chooses the period's rows.
  return {
    value: booksTotals({ payments, otherIncome: other, expenses: [], invoices: [] }).collected,
    count: payments.length + other.length,
  };
}

function spentIn(
  data: ReportData,
  range: { start: string; end: string },
  category?: string,
): { value: number; count: number } {
  const rows = data.expenses
    .filter((row) => inRange(row.day, range))
    .filter((row) => !category || row.category === category);
  return {
    value: booksTotals({ payments: [], expenses: rows, invoices: [] }).spent,
    count: rows.length,
  };
}

/** The invoice shape booksTotals reads (its own deleted/status exclusions). */
const booksInvoiceRows = (data: ReportData) =>
  data.invoices.map((row) => ({
    total: row.total,
    amount_paid: row.amountPaid,
    status: row.status,
    kind: row.kind,
    deleted_at: row.deleted ? 'deleted' : null,
  }));

function metricTotal(
  metric: Metric,
  data: ReportData,
  range: ReportRange,
  category?: string,
): { value: number; count: number } {
  if (metric === 'collected') return collectedIn(data, range);
  if (metric === 'spent') return spentIn(data, range, category);
  if (metric === 'net') {
    const payments = data.payments.filter((row) => inRange(row.day, range));
    const other = data.otherIncome.filter((row) => inRange(row.day, range));
    const expenses = data.expenses
      .filter((row) => inRange(row.day, range))
      .filter((row) => !category || row.category === category);
    return {
      value: booksTotals({ payments, otherIncome: other, expenses, invoices: [] }).net,
      count: payments.length + other.length + expenses.length,
    };
  }
  if (metric === 'invoiced') {
    const rows = data.invoices.filter((row) =>
      !row.deleted
      && row.kind === 'invoice'
      && row.status !== 'draft'
      && row.status !== 'void'
      && inRange(row.issuedDay, range));
    return { value: roundCurrency(rows.reduce((sum, row) => sum + row.total, 0)), count: rows.length };
  }
  // Outstanding is as of now, never limited to the period.
  const open = data.invoices.filter((row) =>
    !row.deleted && row.kind === 'invoice' && (row.status === 'sent' || row.status === 'overdue'));
  return {
    value: booksTotals({ payments: [], expenses: [], invoices: booksInvoiceRows(data) }).outstanding,
    count: open.length,
  };
}

type Group = { name: string; total: number; count: number };

function addTo(map: Map<string, Group>, name: string, amount: number): void {
  const key = normName(name) || 'unknown';
  const current = map.get(key) ?? { name, total: 0, count: 0 };
  current.total = roundCurrency(current.total + amount);
  current.count += 1;
  map.set(key, current);
}

function grouped(data: ReportData, metric: Metric, range: ReportRange, category?: string): Group[] {
  const map = new Map<string, Group>();
  if (metric === 'collected' || metric === 'net') {
    for (const row of data.payments) if (inRange(row.day, range)) addTo(map, row.clientName, row.amount);
    for (const row of data.otherIncome) if (inRange(row.day, range)) addTo(map, row.clientName, row.amount);
  }
  if (metric === 'spent' || metric === 'net') {
    for (const row of data.expenses) {
      if (!inRange(row.day, range)) continue;
      if (category && row.category !== category) continue;
      addTo(map, row.clientName, metric === 'spent' ? row.amount : -row.amount);
    }
  }
  if (metric === 'invoiced') {
    for (const row of data.invoices) {
      if (row.deleted || row.kind !== 'invoice' || row.status === 'draft' || row.status === 'void') continue;
      if (!inRange(row.issuedDay, range)) continue;
      addTo(map, row.clientName, row.total);
    }
  }
  if (metric === 'outstanding') {
    for (const row of data.invoices) {
      if (row.deleted || row.kind !== 'invoice' || (row.status !== 'sent' && row.status !== 'overdue')) continue;
      addTo(map, row.clientName, Math.max(0, row.total - row.amountPaid));
    }
  }
  return [...map.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

type Payer = { name: string; days: number; count: number };

function payerStats(invoices: Invoice[]): Map<string, Payer> {
  const map = new Map<string, Payer>();
  for (const invoice of invoices) {
    if (invoice.deleted || invoice.kind !== 'invoice' || invoice.status !== 'paid') continue;
    if (!invoice.sentDay || !invoice.paidDay) continue;
    const days = daysBetween(invoice.sentDay, invoice.paidDay);
    if (days < 0) continue;
    const key = normName(invoice.clientName);
    const current = map.get(key) ?? { name: invoice.clientName, days: 0, count: 0 };
    current.days += days;
    current.count += 1;
    map.set(key, current);
  }
  return map;
}

const averageDays = (payer: Payer | undefined): number | null =>
  !payer || payer.count < 2 ? null : Math.round(payer.days / payer.count);

type Slowest = { name: string; owed: number; days: number; paidInvoices: number };

/** What each client still owes now, across every open invoice. */
function outstandingByClient(invoices: Invoice[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const invoice of invoices) {
    if (invoice.deleted || invoice.kind !== 'invoice') continue;
    if (invoice.status !== 'sent' && invoice.status !== 'overdue') continue;
    const key = normName(invoice.clientName);
    map.set(key, roundCurrency((map.get(key) ?? 0) + Math.max(0, invoice.total - invoice.amountPaid)));
  }
  return map;
}

/**
 * The slowest payers, from all fully paid invoices ever — never the requested
 * period's groups. A client needs at least two fully paid invoices to rank; a
 * client with exactly one is counted as left out.
 */
function slowestPayers(invoices: Invoice[]): { ranked: Slowest[]; excluded: number } {
  const stats = payerStats(invoices);
  const owed = outstandingByClient(invoices);
  const ranked = [...stats.entries()]
    .filter(([, payer]) => payer.count >= 2)
    .map(([key, payer]) => ({
      name: payer.name,
      owed: owed.get(key) ?? 0,
      days: Math.round(payer.days / payer.count),
      paidInvoices: payer.count,
    }))
    .sort((a, b) => b.days - a.days || b.owed - a.owed || a.name.localeCompare(b.name));
  const excluded = [...stats.values()].filter((payer) => payer.count === 1).length;
  return { ranked, excluded };
}

function trendPoints(
  data: ReportData,
  range: ReportRange,
  group: 'week' | 'month',
  category?: string,
): TrendPoint[] {
  const buckets = new Map<string, { start: string; end: string; label: string; full: string }>();
  if (group === 'week') {
    for (let day = range.start; day <= range.end; day = addDays(day, 1)) {
      const week = weekBounds(day);
      if (!buckets.has(week.start)) {
        buckets.set(week.start, {
          start: week.start,
          end: week.end,
          label: weekLabel(week.start),
          full: weekFull(week.start, week.end),
        });
      }
    }
  } else {
    const [startY, startM] = range.start.split('-').map(Number);
    const [endY, endM] = range.end.split('-').map(Number);
    let y = startY;
    let m = startM;
    while (y < endY || (y === endY && m <= endM)) {
      const bounds = monthBounds(y, m);
      buckets.set(bounds.start, {
        ...bounds,
        label: `${MONTHS[m - 1]} ${y}`,
        full: `${MONTHS[m - 1]} ${y}`,
      });
      m += 1;
      if (m === 13) { m = 1; y += 1; }
    }
  }

  const points: TrendPoint[] = [];
  for (const bucket of buckets.values()) {
    const start = bucket.start < range.start ? range.start : bucket.start;
    const end = bucket.end > range.end ? range.end : bucket.end;
    const clipped = { start, end };
    const inc = collectedIn(data, clipped).value;
    const out = spentIn(data, clipped, category).value;
    points.push({
      label: bucket.label,
      full: bucket.full,
      inc: Math.max(0, roundCurrency(inc)),
      out: Math.max(0, roundCurrency(out)),
    });
  }
  return points;
}

// ── The tool ─────────────────────────────────────────────────────────────

const FIXTURE_RANGE: ReportRange = {
  id: 'this_month', label: 'This month', start: '2026-11-01', end: '2026-11-30', kind: 'month',
};

const fixtureTile = {
  label: 'Collected',
  value: '+$420.00',
  tone: 'in' as const,
  period: 'This month',
};

export const runReportTool = defineTool({
  name: RUN_REPORT,
  description:
    'Read-only money report: collected, spent, net, invoiced or outstanding for this/last week, month or year, or a custom from/to. Uses the owner’s profile timezone; weeks start Monday. Group by none (tiles), week or month (trend), category (spending breakdown) or client (ranked list). Pass sort "slowest" to answer who pays slowest: it always groups by client and ranks clients with two or more fully paid invoices across all time by average days to pay, ignoring the requested period for the ranking; each row shows what that client still owes now. Optional compare to the previous period. Outstanding is always as of now, never limited to the past period. Figures equal the Books tab for the same period.',
  input: RunReportInput,
  output: RunReportOutput,
  type: 'read',
  risk: 'low',
  defaultTemplate: { id: 'stat.tiles', props: StatTilesProps },
  templates: [
    { id: 'stat.tiles', props: StatTilesProps },
    { id: 'chart.trend', props: TrendChartProps },
    { id: 'chart.breakdown', props: BreakdownProps },
    { id: 'list.ranked', props: RankedListProps },
  ],
  propsFor: (result, id) => {
    const output = result as { tiles: unknown; trend: unknown; breakdown: unknown };
    if (id === 'stat.tiles') return output.tiles;
    if (id === 'chart.trend') return output.trend;
    if (id === 'chart.breakdown') return output.breakdown;
    return result;
  },
  templateFor: (result) => {
    if (result.match === 'none') return null;
    if (result.groupBy === 'week' || result.groupBy === 'month') {
      return result.trend.points.length >= 2 ? 'chart.trend' : 'stat.tiles';
    }
    if (result.groupBy === 'category') {
      if (result.metric !== 'spent') return 'stat.tiles';
      return result.breakdown.state === 'filled' ? 'chart.breakdown' : 'stat.tiles';
    }
    if (result.groupBy === 'client') return 'list.ranked';
    return 'stat.tiles';
  },
  destination: { screen: 'Books summary', path: '/summary' },
  handler: async (ctx, args) => {
    const ignored: string[] = [];

    const rawMetric = args.metric?.trim().toLowerCase();
    const metric: Metric = (METRICS as readonly string[]).includes(rawMetric ?? '')
      ? rawMetric as Metric
      : 'collected';
    if (rawMetric && metric !== rawMetric) ignored.push(args.metric as string);

    const rawGroup = args.group_by?.trim().toLowerCase();
    let group: GroupBy = (GROUPS as readonly string[]).includes(rawGroup ?? '')
      ? rawGroup as GroupBy
      : 'none';
    if (rawGroup && group !== rawGroup) ignored.push(args.group_by as string);

    const rawPeriod = args.period?.trim().toLowerCase();
    const period: PeriodName = (PERIODS as readonly string[]).includes(rawPeriod ?? '')
      ? rawPeriod as PeriodName
      : 'this_month';
    if (rawPeriod && period !== rawPeriod) ignored.push(args.period as string);

    const rawSort = args.sort?.trim().toLowerCase();
    const sort = rawSort === 'slowest' ? 'slowest' : 'amount';
    if (rawSort && rawSort !== 'slowest' && rawSort !== 'amount') ignored.push(args.sort as string);
    // Asking for the slowest payers is a client question; it sets the grouping.
    if (sort === 'slowest') group = 'client';

    const category = forgivingCategory(args.category);
    ignored.push(...category.ignored);
    if (category.category && metric !== 'spent' && metric !== 'net') {
      ignored.push('category only narrows spending');
    }

    const profile = await ctx.db.select<{ timezone: string | null }>('profiles', {
      columns: 'timezone',
      eq: { id: ctx.userId },
    });
    if (profile.error) throw new Error(profile.error.message);
    const tz = resolveTimeZone(profile.data?.[0]?.timezone);

    const today = localYmd(tz, new Date());
    const { range, ignored: rangeIgnored } = resolveReportRange(period, today, args.from, args.to);
    ignored.push(...rangeIgnored);

    const [payRes, invRes, expRes, otherRes] = await Promise.all([
      ctx.db.select<RawPayment>('invoice_payments', {
        columns: '*', eq: { user_id: ctx.userId }, order: { column: 'paid_at', ascending: false },
      }),
      ctx.db.select<RawInvoice>('invoices', {
        columns: '*', eq: { user_id: ctx.userId },
      }),
      ctx.db.select<RawExpense>('expenses', {
        columns: '*', eq: { user_id: ctx.userId }, is: { deleted_at: null },
      }),
      ctx.db.select<RawOther>('other_income', {
        columns: '*', eq: { user_id: ctx.userId }, is: { deleted_at: null },
      }),
    ]);
    if (payRes.error) throw new Error(payRes.error.message);
    if (invRes.error) throw new Error(invRes.error.message);
    if (expRes.error) throw new Error(expRes.error.message);
    if (otherRes.error) throw new Error(otherRes.error.message);

    const invoiceById = new Map<string, Invoice>();
    for (const raw of invRes.data ?? []) {
      if (!raw.id) continue;
      invoiceById.set(raw.id, {
        id: raw.id,
        clientName: raw.client_name?.trim() || 'Client',
        kind: raw.kind ?? 'invoice',
        status: raw.status,
        total: num(raw.total),
        amountPaid: num(raw.amount_paid),
        issuedDay: dayOf(raw.created_at, tz),
        sentDay: dayOf(raw.first_sent_at ?? raw.sent_at ?? raw.created_at, tz),
        paidDay: dayOf(raw.paid_at, tz),
        deleted: Boolean(raw.deleted_at),
      });
    }
    const invoices = [...invoiceById.values()];

    const payments: Payment[] = [];
    for (const raw of payRes.data ?? []) {
      const invoice = invoiceById.get(raw.invoice_id);
      if (!invoice || invoice.deleted || invoice.kind !== 'invoice') continue;
      const day = booksDay('payment', raw.paid_at, tz);
      if (!day) continue;
      payments.push({ clientName: invoice.clientName, amount: num(raw.amount), day });
    }

    const otherIncome: Other[] = (otherRes.data ?? [])
      .filter((raw) => countsAsIncome(raw.classification) && !raw.deleted_at)
      .map((raw) => ({
        clientName: (raw.client_name ?? '').trim() || (raw.title ?? '').trim() || 'Other income',
        amount: num(raw.amount),
        day: booksDay('other_income', raw.received_on, tz),
      }));

    const expenses: Expense[] = (expRes.data ?? [])
      .filter((raw) => !raw.deleted_at)
      .map((raw) => {
        const linked = raw.invoice_id ? invoiceById.get(raw.invoice_id) : undefined;
        return {
          clientName: linked && !linked.deleted && linked.kind === 'invoice' ? linked.clientName : 'No client',
          amount: num(raw.amount),
          category: isExpenseCategory(raw.category) ? raw.category : 'other',
          day: booksDay('expense', raw.spent_on),
        };
      });

    const data: ReportData = { payments, otherIncome, expenses, invoices };

    const value = metricTotal(metric, data, range, category.category);
    const money = metricMoney(metric, value.value);
    const label = metricLabel(metric);
    const eyebrow = sort === 'slowest'
      ? 'Slowest payers · avg days late'
      : group === 'client' ? 'Clients' : group === 'category' ? 'Spending' : 'Your report';
    const title = sort === 'slowest'
      ? 'Slowest to pay, slowest first.'
      : group === 'client' ? 'Top clients'
        : group === 'category' ? 'Spending by category' : range.label;

    // ── comparison ──
    let comparison: RunReportOutputNullable['comparison'] = null;
    let change: { dir: 'up' | 'down' | 'flat'; text: string } | undefined;
    if (args.compare && metric !== 'outstanding') {
      const previous = previousRange(range);
      const before = metricTotal(metric, data, previous, category.category);
      const diff = roundCurrency(value.value - before.value);
      const dir: 'up' | 'down' | 'flat' = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
      const text = before.value === 0
        ? value.value === 0 ? 'No change' : 'No prior figure'
        : diff === 0
          ? 'No change'
          : `${dir === 'up' ? 'Up' : 'Down'} ${Math.abs(Math.round((diff / Math.abs(before.value)) * 100))}%`;
      comparison = {
        previousLabel: previous.label,
        previous: metricMoney(metric, before.value).text,
        previousAmount: before.value,
        previousZero: before.value === 0,
        dir,
        text,
      };
      change = { dir, text };
    }

    // ── tiles ──
    const tiles: StatTilesProps = {
      state: 'filled',
      eyebrow,
      title,
      tiles: [{
        label,
        value: money.text,
        tone: money.tone,
        period: metric === 'outstanding' ? 'as of now' : range.label,
        ...(change ? { change } : {}),
      }],
    };

    // ── trend (week / month) ──
    const points = group === 'week' || group === 'month'
      ? trendPoints(data, range, group, category.category)
      : [];
    const trend = trendChartProps({ eyebrow, title }, points);

    // ── category breakdown ──
    const spend = spentIn(data, range, category.category);
    const byCategory = new Map<string, { name: string; value: number }>();
    for (const row of expenses) {
      if (!inRange(row.day, range)) continue;
      if (category.category && row.category !== category.category) continue;
      const name = CATEGORY_LABEL[row.category as keyof typeof CATEGORY_LABEL] ?? CATEGORY_LABEL.other;
      const current = byCategory.get(name) ?? { name, value: 0 };
      current.value = roundCurrency(current.value + row.amount);
      byCategory.set(name, current);
    }
    const categoryRows = [...byCategory.values()]
      .filter((row) => row.value !== 0)
      .sort((a, b) => b.value - a.value);
    const rest = categoryRows.slice(6).reduce((sum, row) => roundCurrency(sum + row.value), 0);
    const breakdown = breakdownView({
      eyebrow,
      tone: 'out',
      total: moneyText(spend.value),
      rows: categoryRows.map((row) => ({ name: row.name, amount: moneyText(row.value), value: row.value })),
      ...(categoryRows.length > 6 ? { otherAmount: moneyText(rest) } : {}),
    }).props;

    // ── client ranking ──
    const stats = payerStats(invoices);
    const groups = grouped(data, metric, range, category.category);
    let slowest: Slowest[] = [];
    let slowestExcluded = 0;
    let slowestNote = '';
    if (sort === 'slowest') {
      const result = slowestPayers(invoices);
      slowest = result.ranked;
      slowestExcluded = result.excluded;
      slowestNote = 'Ranked across all time; the requested period is ignored for the ranking.';
      if (slowestExcluded) {
        slowestNote += ` ${slowestExcluded} ${slowestExcluded === 1 ? 'client' : 'clients'} left out (only one paid invoice).`;
      }
    }

    const noun = metric === 'collected' ? 'payments'
      : metric === 'spent' ? 'expenses'
        : metric === 'invoiced' ? 'invoices'
          : metric === 'outstanding' ? 'open invoices'
            : 'records';

    const rankedRows = sort === 'slowest'
      ? slowest.slice(0, args.limit ?? READ_CAP).map((entry) => ({
        name: entry.name,
        secondary: `${entry.paidInvoices} paid ${entry.paidInvoices === 1 ? 'invoice' : 'invoices'}`,
        amount: moneyText(entry.owed),
        tone: 'neutral' as const,
        chip: { tone: 'late' as const, label: `${entry.days}d avg` },
      }))
      : groups.slice(0, args.limit ?? READ_CAP).map((entry) => {
        const amount = metricMoney(metric, entry.total);
        const payer = stats.get(normName(entry.name));
        const days = averageDays(payer);
        return {
          name: entry.name,
          secondary: `${entry.count} ${noun}`,
          amount: amount.text,
          tone: amount.tone,
          ...(days !== null ? { chip: { tone: 'late' as const, label: `${days}d avg` } } : {}),
        };
      });
    const slowestOwed = roundCurrency(slowest.reduce((sum, entry) => sum + entry.owed, 0));
    const rankedTotal = sort === 'slowest'
      ? {
        label: `Still owed · ${slowest.length} ${slowest.length === 1 ? 'client' : 'clients'}`,
        amount: moneyText(slowestOwed),
        tone: 'neutral' as const,
      }
      : {
        label: `${groups.length} ${groups.length === 1 ? 'client' : 'clients'}`,
        amount: metricMoney(metric, value.value).text,
      };
    const ranked = rankedView({
      eyebrow,
      title,
      rows: rankedRows,
      totalCount: sort === 'slowest' ? slowest.length : groups.length,
      total: rankedTotal,
      destination: { screen: 'Books summary', path: '/summary' },
    });

    const clients = sort === 'slowest'
      ? slowest.map((entry) => ({
        name: entry.name,
        total: moneyText(entry.owed),
        averageDaysToPay: entry.days,
        paidInvoices: entry.paidInvoices,
      }))
      : groups.map((entry) => {
        const payer = stats.get(normName(entry.name));
        const days = averageDays(payer);
        return {
          name: entry.name,
          total: metricMoney(metric, entry.total).text,
          averageDaysToPay: days,
          paidInvoices: payer?.count ?? 0,
        };
      });

    const total = group === 'client'
      ? ranked.props.total
      : { label: `${value.count} ${value.count === 1 ? 'record' : 'records'}`, amount: money.text };
    const matched = sort === 'slowest' ? slowest.length : value.count;

    return {
      match: matchOf(matched),
      count: matched,
      ignored,
      eyebrow,
      title,
      metric,
      groupBy: group,
      period: { id: range.id, label: range.label, start: range.start, end: range.end, timezone: tz },
      value: { amount: money.amount, text: money.text, tone: money.tone },
      comparison,
      tiles,
      trend,
      breakdown,
      rows: group === 'client' ? ranked.props.rows : [],
      totalCount: group === 'client' ? ranked.props.totalCount : value.count,
      total,
      hideTotal: group !== 'client',
      clients,
      slowestExcluded,
      slowestNote,
      outstandingAsOf: 'now' as const,
      outstandingNote: 'Still owed is as of now, not limited to the period.',
    };
  },
  fallback: (result) => {
    if (result.match === 'none') return `Nothing logged for ${result.period.label}.`;
    if (result.metric === 'outstanding') {
      return `Still owed as of now: ${result.value.text}.`;
    }
    if (result.groupBy === 'client' && result.slowestNote) {
      return `${result.total.label}. ${result.slowestNote}`;
    }
    return `${result.tiles.tiles[0]?.label ?? 'Report'} for ${result.period.label}: ${result.value.text}.`;
  },
  fixture: {
    args: { metric: 'collected', period: 'this_month' },
    result: {
      match: 'many',
      count: 2,
      ignored: [],
      eyebrow: 'Your report',
      title: 'This month',
      metric: 'collected',
      groupBy: 'none',
      period: {
        id: FIXTURE_RANGE.id, label: FIXTURE_RANGE.label, start: FIXTURE_RANGE.start,
        end: FIXTURE_RANGE.end, timezone: 'America/Chicago',
      },
      value: { amount: 420, text: '+$420.00', tone: 'in' },
      comparison: null,
      tiles: {
        state: 'filled',
        eyebrow: 'Your report',
        title: 'This month',
        tiles: [fixtureTile],
      },
      trend: { state: 'empty', eyebrow: 'Your report', title: 'This month', points: [] },
      breakdown: { state: 'empty', tone: 'out', eyebrow: 'Spending', total: '$0.00', rows: [] },
      rows: [],
      totalCount: 2,
      total: { label: '2 records', amount: '+$420.00' },
      hideTotal: true,
      clients: [],
      slowestExcluded: 0,
      slowestNote: '',
      outstandingAsOf: 'now',
      outstandingNote: 'Still owed is as of now, not limited to the period.',
    },
  },
});

type RunReportOutputNullable = { comparison: { previousLabel: string; previous: string; previousAmount: number; previousZero: boolean; dir: 'up' | 'down' | 'flat'; text: string } | null };
