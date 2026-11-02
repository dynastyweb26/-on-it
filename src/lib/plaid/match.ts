// ═══ Bank row ↔ expense matching, and the money primitives ═══
// Pure and server-side: the GET route uses it to suggest an expense, the review
// route uses it to resolve "Already recorded". Nothing here touches Supabase.
//
// Money rule: a bank row's numeric(12,2) becomes an integer of cents before any
// comparison. No float arithmetic ever decides whether two amounts are equal.
import type { ExpenseCategory } from '../expenses';

/** Sanity cap for an added amount: $100,000.00. Above this the body is refused. */
export const MAX_EXPENSE_CENTS = 10_000_000;

/** A bank charge and an expense may be a few days apart (hold vs post date). */
export const MATCH_DAY_WINDOW = 3;

/**
 * "30.38" | 30.38 | "432.98" → integer cents, exactly. `30.38` as a JS number
 * stringifies back to "30.38", so the parse never multiplies a float by 100.
 */
export function parseCents(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const raw = typeof value === 'number'
    ? (Number.isFinite(value) ? value.toFixed(2) : '')
    : String(value).trim();
  const m = /^(-?)(\d{1,12})(?:\.(\d{1,2}))?$/.exec(raw);
  if (!m) return null;
  const cents = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) return null;
  return m[1] ? -cents : cents;
}

/** Integer cents → the exact decimal string a numeric(12,2) column wants. */
export function centsToAmount(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

const VENDOR_NOISE = new Set(['inc', 'llc', 'ltd', 'co', 'corp', 'company', 'plc', 'lp', 'the']);

/** "Costco Wholesale #123" → "costco wholesale" (lowercase, alphanumerics only). */
export function normalizeVendor(name: string | null | undefined): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((word) => word.length > 0 && !VENDOR_NOISE.has(word))
    .join(' ');
}

/** Same merchant, allowing for "Costco" vs "Costco Wholesale #123". */
export function vendorsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeVendor(a);
  const right = normalizeVendor(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (Math.min(left.length, right.length) < 4) return false;
  if (left.includes(right) || right.includes(left)) return true;
  const words = new Set(left.split(' '));
  return right.split(' ').some((word) => word.length >= 4 && words.has(word));
}

/** yyyy-mm-dd as a UTC day number — date math without a clock or a timezone. */
export function dayNumber(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000);
}

/** Whole days between two yyyy-mm-dd dates, or null when either is malformed. */
export function daysBetween(a: string, b: string): number | null {
  const left = dayNumber(a);
  const right = dayNumber(b);
  return left === null || right === null ? null : Math.abs(left - right);
}

export function shiftIsoDay(iso: string, days: number): string | null {
  const day = dayNumber(iso);
  if (day === null) return null;
  return new Date((day + days) * 86_400_000).toISOString().slice(0, 10);
}

/** The expense columns the matcher reads. */
export type MatchExpense = {
  id: string;
  vendor: string | null;
  description: string | null;
  amount: string | number;
  spent_on: string;
  category: string | null;
};

export type MatchRow = {
  amount_cents: number;
  occurred_on: string;
  merchant: string | null;
  description: string;
};

export type SuggestedMatch = {
  expense_id: string;
  vendor: string;
  amount_cents: number;
  date: string;
  /** Same amount AND a matching merchant: the card can say it is the charge. */
  strong: boolean;
};

/** Which merchant line an expense stands behind. */
const expenseVendor = (expense: MatchExpense): string =>
  (expense.vendor ?? '').trim() || (expense.description ?? '').trim();

/**
 * The expense a bank row most likely already is: same amount to the cent, date
 * within ±3 days, not already linked to another bank row. A merchant match wins
 * over a nearer date; ties go to the nearest date, then the older expense id so
 * one row always suggests the same expense.
 */
export function suggestMatch(
  row: MatchRow,
  expenses: MatchExpense[],
  linkedExpenseIds: ReadonlySet<string>,
): SuggestedMatch | null {
  const candidates: SuggestedMatch[] = [];
  for (const expense of expenses) {
    if (linkedExpenseIds.has(expense.id)) continue;
    const cents = parseCents(expense.amount);
    if (cents === null || cents !== row.amount_cents) continue;
    const distance = daysBetween(row.occurred_on, expense.spent_on);
    if (distance === null || distance > MATCH_DAY_WINDOW) continue;
    const vendor = expenseVendor(expense);
    candidates.push({
      expense_id: expense.id,
      vendor,
      amount_cents: cents,
      date: expense.spent_on,
      strong: vendorsMatch(row.merchant ?? row.description, vendor),
    });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    if (a.strong !== b.strong) return a.strong ? -1 : 1;
    const da = daysBetween(row.occurred_on, a.date) ?? MATCH_DAY_WINDOW;
    const db = daysBetween(row.occurred_on, b.date) ?? MATCH_DAY_WINDOW;
    if (da !== db) return da - db;
    return a.expense_id.localeCompare(b.expense_id);
  });
  return candidates[0];
}

// Plaid's personal_finance_category.primary → the app's eight-plus categories.
const CATEGORY_HINTS: [RegExp, ExpenseCategory][] = [
  [/INSURANCE/, 'insurance'],
  [/TELECOM|PHONE|MOBILE|INTERNET/, 'phone'],
  [/SUBSCRIPTION|STREAMING|SOFTWARE|CLOUD/, 'subscriptions'],
  [/FOOD|RESTAURANT|GROCER|COFFEE|DINING/, 'food'],
  [/GAS|FUEL|OIL|PETRO|TRANSPORT|RIDESHARE|TAXI|PARKING|AUTO/, 'fuel'],
  [/TRAVEL|AIRLINE|HOTEL|LODGING/, 'travel'],
  [/HOME_IMPROVEMENT|HARDWARE|SUPPLIES|OFFICE|MERCHANDISE|WHOLESALE/, 'supplies'],
  [/TOOL|EQUIPMENT|INDUSTRIAL/, 'tools'],
  [/MAINTENANCE|REPAIR|UTILIT/, 'maintenance'],
];

/** Plaid's category string (or the description) → a category the DB accepts. */
export function expenseCategoryFromPlaid(
  category: string | null | undefined,
  description?: string | null,
): ExpenseCategory {
  const haystack = `${category ?? ''} ${description ?? ''}`.toUpperCase();
  for (const [pattern, mapped] of CATEGORY_HINTS) if (pattern.test(haystack)) return mapped;
  return 'other';
}
