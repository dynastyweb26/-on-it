// ═══ AI Smart · shared read-tool plumbing ═══
//
// Six read tools answer from the caller's own rows. What they share lives here:
// how a name is compared, how a result says 0/1/many, what a forgiving filter
// does with a value it does not know, and how a money string is composed.
//
// Filters are forgiving by rule: an unknown status, a bad date or a negative
// amount is IGNORED and named in `ignored`, never an error the model has to
// explain away. The handler still scopes every select by the caller's session.
import { money } from '@/lib/financials';
import { docNoun, formatDocNumber } from '@/lib/documents';
import { CATEGORY_LABEL, EXPENSE_CATEGORIES, isExpenseCategory, type ExpenseCategory } from '@/lib/expenses';
import { z } from 'zod';

export type Match = 'none' | 'one' | 'many';

export function matchOf(count: number): Match {
  return count === 0 ? 'none' : count === 1 ? 'one' : 'many';
}

/** Case, accents and punctuation do not decide whether a name matches. */
export function normName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Fuzzy in one direction only: every word the user typed must appear in the
 * client's name (as a prefix of some word there), so "ruth l" finds "Ruth
 * Lawrence" and "chen" finds "Chenyi", but "tony" does not find "Anthony".
 */
export function nameMatches(query: string, candidate: string): boolean {
  const q = normName(query);
  if (!q) return true;
  const words = normName(candidate).split(' ').filter(Boolean);
  return q.split(' ').every((token) => words.some((w) => w.startsWith(token)));
}

/** The statuses the invoices table accepts (001_init). */
export const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'overdue', 'void'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const READ_CAP = 25;

/** The words a person uses for an expense category, including the common ones
 *  that are not the stored key (gas → fuel, meals → food). */
const CATEGORY_ALIASES: Record<string, ExpenseCategory> = {
  gas: 'fuel',
  gasoline: 'fuel',
  petrol: 'fuel',
  diesel: 'fuel',
  meal: 'food',
  meals: 'food',
  restaurant: 'food',
  restaurants: 'food',
  material: 'supplies',
  materials: 'supplies',
  supply: 'supplies',
  tool: 'tools',
  software: 'subscriptions',
  subscription: 'subscriptions',
  car: 'travel',
  mileage: 'travel',
  repair: 'maintenance',
  repairs: 'maintenance',
  cell: 'phone',
};

/**
 * One category word → the stored key, or nothing. Forgiving by rule: an
 * unknown word is ignored and named, never an error the model must explain.
 */
export function forgivingCategory(value: string | null | undefined): {
  category?: ExpenseCategory;
  ignored: string[];
} {
  const raw = value?.trim();
  if (!raw) return { ignored: [] };
  const key = normName(raw);
  if (isExpenseCategory(key)) return { category: key, ignored: [] };
  const byLabel = EXPENSE_CATEGORIES.find((c) => normName(CATEGORY_LABEL[c]) === key);
  if (byLabel) return { category: byLabel, ignored: [] };
  const alias = CATEGORY_ALIASES[key];
  if (alias) return { category: alias, ignored: [] };
  return { ignored: [raw] };
}

/** The periods run_report understands: one stored key per period. */
export const REPORT_PERIODS = [
  'this_week', 'last_week', 'this_month', 'last_month', 'this_year', 'last_year', 'custom',
] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

/**
 * The words a person uses for a period, normalised with normName() so case,
 * spacing and punctuation never decide it. A bare "year" is this year and a bare
 * "month" is this month; "ytd" is this year too.
 */
const PERIOD_ALIASES: Record<string, ReportPeriod> = {
  week: 'this_week',
  'this week': 'this_week',
  'current week': 'this_week',
  'last week': 'last_week',
  'previous week': 'last_week',
  month: 'this_month',
  'this month': 'this_month',
  'current month': 'this_month',
  'last month': 'last_month',
  'previous month': 'last_month',
  year: 'this_year',
  ytd: 'this_year',
  'y t d': 'this_year',
  'year to date': 'this_year',
  'this year': 'this_year',
  'current year': 'this_year',
  'last year': 'last_year',
  'previous year': 'last_year',
};

/**
 * One period word → the stored period, or nothing. Forgiving by rule, the same
 * way forgivingCategory is: an unknown word is named in `ignored` and resolves
 * to NO period, so the caller must refuse to report rather than default.
 */
export function forgivingPeriod(value: string | null | undefined): {
  period?: ReportPeriod;
  ignored: string[];
} {
  const raw = value?.trim();
  if (!raw) return { ignored: [] };
  const key = normName(raw);
  if ((REPORT_PERIODS as readonly string[]).includes(key)) {
    return { period: key as ReportPeriod, ignored: [] };
  }
  const alias = PERIOD_ALIASES[key];
  if (alias) return { period: alias, ignored: [] };
  return { ignored: [raw] };
}

/** The metrics run_report understands: one stored key per metric. */
export const REPORT_METRICS = ['collected', 'spent', 'net', 'invoiced', 'outstanding'] as const;
export type ReportMetric = (typeof REPORT_METRICS)[number];

/**
 * The words a person uses for a metric, normalised with normName() so case and
 * punctuation never decide it: "income", "revenue", "made" and "earned" are
 * collected money, "owed" and "unpaid" are outstanding.
 */
const METRIC_ALIASES: Record<string, ReportMetric> = {
  income: 'collected',
  revenue: 'collected',
  made: 'collected',
  earned: 'collected',
  expense: 'spent',
  expenses: 'spent',
  spending: 'spent',
  spend: 'spent',
  profit: 'net',
  kept: 'net',
  keep: 'net',
  owed: 'outstanding',
  unpaid: 'outstanding',
  due: 'outstanding',
};

/**
 * One metric word → the stored metric, or nothing. Forgiving by rule, the same
 * way forgivingCategory is: an unknown word is named in `ignored` and resolves
 * to NO metric, so the caller can refuse to report rather than pick one.
 */
export function forgivingMetric(value: string | null | undefined): {
  metric?: ReportMetric;
  ignored: string[];
} {
  const raw = value?.trim();
  if (!raw) return { ignored: [] };
  const key = normName(raw);
  if ((REPORT_METRICS as readonly string[]).includes(key)) {
    return { metric: key as ReportMetric, ignored: [] };
  }
  const alias = METRIC_ALIASES[key];
  if (alias) return { metric: alias, ignored: [] };
  return { ignored: [raw] };
}

export type Filters = {
  status?: string[];
  client?: string;
  from?: string;
  to?: string;
  min_amount?: number;
  max_amount?: number;
};

export type FilterOutcome = {
  filters: Filters;
  /** Values that were not understood, in the shape the user sent them. */
  ignored: string[];
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function forgivingFilters(input: Filters): FilterOutcome {
  const ignored: string[] = [];
  const out: Filters = {};

  if (input.status?.length) {
    const ok = input.status
      .map((s) => s.trim().toLowerCase())
      .filter((s): s is InvoiceStatus => (INVOICE_STATUSES as readonly string[]).includes(s));
    const bad = input.status.filter((s) => !(INVOICE_STATUSES as readonly string[]).includes(s.trim().toLowerCase()));
    if (bad.length) ignored.push(...bad);
    if (ok.length) out.status = ok;
  }
  if (input.client?.trim()) out.client = input.client.trim();

  for (const key of ['from', 'to'] as const) {
    const value = input[key]?.trim();
    if (!value) continue;
    if (ISO_DATE.test(value) && !Number.isNaN(Date.parse(value))) out[key] = value;
    else ignored.push(value);
  }

  for (const key of ['min_amount', 'max_amount'] as const) {
    const value = input[key];
    if (value === undefined) continue;
    if (Number.isFinite(value) && value >= 0) out[key] = value;
    else ignored.push(String(value));
  }

  return { filters: out, ignored };
}

/** A row as the invoices table stores it, narrowed to what these tools read. */
export const ExpenseRow = z.object({
  id: z.string(),
  description: z.string().nullable().optional(),
  vendor: z.string().nullable().optional(),
  amount: z.union([z.number(), z.string()]),
  category: z.string().nullable().optional(),
  tax_deductible: z.boolean().nullable().optional(),
  invoice_id: z.string().nullable().optional(),
  spent_on: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  deleted_at: z.string().nullable().optional(),
});
export type ExpenseRow = z.infer<typeof ExpenseRow>;

export function asExpenseRow(raw: unknown): ExpenseRow {
  const r = raw as Record<string, unknown>;
  return ExpenseRow.parse({
    ...r,
    amount: num(r.amount),
    spent_on: toIso(r.spent_on),
    created_at: toIso(r.created_at),
    deleted_at: toIso(r.deleted_at),
  });
}

export function expenseCategoryLabel(value: string | null | undefined): string {
  return isExpenseCategory(value) ? CATEGORY_LABEL[value] : CATEGORY_LABEL.other;
}

export const InvoiceRow = z.object({
  id: z.string(),
  kind: z.string().nullable().optional(),
  invoice_number: z.number().int(),
  client_id: z.string().nullable().optional(),
  client_name: z.string(),
  status: z.string(),
  total: z.union([z.number(), z.string()]),
  amount_paid: z.union([z.number(), z.string()]).nullable().optional(),
  due_date: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  deleted_at: z.string().nullable().optional(),
});
export type InvoiceRow = z.infer<typeof InvoiceRow>;

export const ClientRow = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
});
export type ClientRow = z.infer<typeof ClientRow>;

/** Postgres/PGlite return Date; Supabase returns text. Tools read either. */
export const toIso = (value: unknown): string | null => {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  return typeof value === 'string' && value ? value : null;
};

export const num = (value: unknown): number => {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
};

/** A finished server money string; the only way an amount reaches a card. */
export const moneyText = (amount: number): string => money(amount);

/** Coerce one raw row (dates, numeric strings) into InvoiceRow. */
export function asInvoiceRow(raw: unknown): InvoiceRow {
  const r = raw as Record<string, unknown>;
  return InvoiceRow.parse({
    ...r,
    total: num(r.total),
    amount_paid: num(r.amount_paid),
    due_date: toIso(r.due_date),
    created_at: toIso(r.created_at),
    deleted_at: toIso(r.deleted_at),
  });
}

export function docLabel(row: InvoiceRow): string {
  return formatDocNumber(row.kind ?? 'invoice', row.invoice_number);
}

export function nounFor(row: InvoiceRow): string {
  return docNoun(row.kind ?? 'invoice').toLowerCase();
}

/** The display line for one document, without inventing copy. */
export function docLine(row: InvoiceRow): string {
  const due = row.due_date ? ` · due ${row.due_date}` : '';
  return `${docLabel(row)} · ${row.status}${due}`;
}

/** Filters over one row, applied in memory because ToolDb has no range/ILIKE. */
export function rowMatches(row: InvoiceRow, filters: Filters): boolean {
  if (row.deleted_at) return false;
  const status = row.status.toLowerCase();
  if (filters.status?.length && !filters.status.includes(status)) return false;
  if (filters.client && !nameMatches(filters.client, row.client_name)) return false;
  if (filters.from) {
    const day = (row.created_at ?? '').slice(0, 10);
    if (!day || day < filters.from) return false;
  }
  if (filters.to) {
    const day = (row.created_at ?? '').slice(0, 10);
    if (!day || day > filters.to) return false;
  }
  if (filters.min_amount !== undefined && num(row.total) < filters.min_amount) return false;
  if (filters.max_amount !== undefined && num(row.total) > filters.max_amount) return false;
  return true;
}

/** The expense day (spent_on is already a local calendar date). */
export function expenseDay(row: ExpenseRow): string {
  return (row.spent_on ?? row.created_at ?? '').slice(0, 10);
}

export function expenseMatches(
  row: ExpenseRow,
  filters: Filters & { category?: ExpenseCategory; text?: string },
): boolean {
  if (row.deleted_at) return false;
  if (filters.category && (isExpenseCategory(row.category) ? row.category : 'other') !== filters.category) return false;
  const day = expenseDay(row);
  if (filters.from && (!day || day < filters.from)) return false;
  if (filters.to && (!day || day > filters.to)) return false;
  if (filters.min_amount !== undefined && num(row.amount) < filters.min_amount) return false;
  if (filters.max_amount !== undefined && num(row.amount) > filters.max_amount) return false;
  if (filters.text) {
    const haystack = [row.vendor, row.description, expenseCategoryLabel(row.category)]
      .filter(Boolean)
      .join(' ');
    if (!nameMatches(filters.text, haystack)) return false;
  }
  return true;
}

/** Newest first, then by number, so the 25-row cap is deterministic. */
export function newestFirst(a: InvoiceRow, b: InvoiceRow): number {
  const ad = a.created_at ?? '';
  const bd = b.created_at ?? '';
  if (ad !== bd) return ad < bd ? 1 : -1;
  return b.invoice_number - a.invoice_number;
}
