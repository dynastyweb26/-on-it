// Newest / A–Z ordering for the Invoices and Expenses lists (UI redesign,
// UI-REDESIGN-AUDIT.md §L1–L2). The lists keep their date groups exactly as
// they are (invoice months; expense weeks with subtotals); A–Z only reorders
// the rows INSIDE each group, by name, case-insensitively, newest first on a
// tie. The choice is remembered per device (localStorage).
import type { DateGroup } from '@/lib/date-groups';

export type ListSort = 'newest' | 'az';

const collator = new Intl.Collator('en-US', { sensitivity: 'base', numeric: true });

/** Rows inside each group A→Z by `nameOf` (blank names last), ties newest
 *  first by `dateOf` (ISO strings compare chronologically). Groups, their
 *  order, labels and subtotals are untouched. */
export function sortWithinGroups<T>(
  groups: DateGroup<T>[],
  nameOf: (t: T) => string | null | undefined,
  dateOf: (t: T) => string,
): DateGroup<T>[] {
  return groups.map((g) => ({
    ...g,
    items: [...g.items].sort((a, b) => {
      const na = (nameOf(a) ?? '').trim(), nb = (nameOf(b) ?? '').trim();
      if (!na !== !nb) return na ? -1 : 1;
      return collator.compare(na, nb) || dateOf(b).localeCompare(dateOf(a));
    }),
  }));
}

/** The stored choice for `key`, or Newest (also when storage is blocked). */
export function readListSort(key: string): ListSort {
  try { return localStorage.getItem(key) === 'az' ? 'az' : 'newest'; } catch { return 'newest'; }
}

export function writeListSort(key: string, v: ListSort) {
  try { localStorage.setItem(key, v); } catch { /* not persisted (private mode) */ }
}

export const INVOICES_SORT_KEY = 'onit-invoices-sort';
export const EXPENSES_SORT_KEY = 'onit-expenses-sort';

// Expenses: Week / Month grouping (§L Q2). Week by default, remembered per
// device; each view has its own group subtotals and the sort applies inside.
export type ExpenseGrouping = 'week' | 'month';
export const EXPENSES_GROUP_KEY = 'onit-expenses-group';

export function readExpenseGrouping(): ExpenseGrouping {
  try { return localStorage.getItem(EXPENSES_GROUP_KEY) === 'month' ? 'month' : 'week'; } catch { return 'week'; }
}

export function writeExpenseGrouping(v: ExpenseGrouping) {
  try { localStorage.setItem(EXPENSES_GROUP_KEY, v); } catch { /* not persisted (private mode) */ }
}

/** The Books "View expenses" subtitle: what the expenses list will show. */
export function expensesListCaption(sort: ListSort, group: ExpenseGrouping): string {
  return `${sort === 'az' ? 'A–Z by vendor' : 'Newest first'}, by ${group}`;
}
