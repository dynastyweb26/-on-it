// ═══ Tax summary — period ranges + category rollup ═══
// A record of LOGGED EXPENSES, grouped by category. Fixed date ranges only
// (This Year / Last Year / This Month) — no custom ranges.
//
// It counts EVERYTHING and never filters on tax_deductible: that column
// defaults false and is user-toggled, so filtering on it would report ~$0.
// Deductibility is surfaced as an indicator only, never used to gate the count.
import { CATEGORY_LABEL, isExpenseCategory, type ExpenseCategory } from '@/lib/expenses';

export type PeriodKey = 'this_year' | 'last_year' | 'this_month';

export interface PeriodRange {
  key: PeriodKey;
  label: string;   // e.g. "2026", "2025", "July 2026"
  start: string;   // yyyy-mm-dd, inclusive
  end: string;     // yyyy-mm-dd, inclusive
}

export const PERIOD_OPTIONS: { key: PeriodKey; tab: string }[] = [
  { key: 'this_year', tab: 'This Year' },
  { key: 'last_year', tab: 'Last Year' },
  { key: 'this_month', tab: 'This Month' },
];

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Range bounds as yyyy-mm-dd (local), matching the expenses.spent_on format so
 *  a lexicographic gte/lte in the query is exact. */
export function periodRange(key: PeriodKey, now = new Date()): PeriodRange {
  const y = now.getFullYear();
  const m = now.getMonth() + 1; // 1–12
  if (key === 'this_year') return { key, label: `${y}`, start: ymd(y, 1, 1), end: ymd(y, 12, 31) };
  if (key === 'last_year') return { key, label: `${y - 1}`, start: ymd(y - 1, 1, 1), end: ymd(y - 1, 12, 31) };
  // this_month — day 0 of next month is the last day of this one.
  const lastDay = new Date(y, m, 0).getDate();
  const label = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return { key, label, start: ymd(y, m, 1), end: ymd(y, m, lastDay) };
}

export interface ExpenseLite {
  amount: number | string;
  category: string;
  tax_deductible?: boolean;
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
