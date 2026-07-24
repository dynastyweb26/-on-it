// ═══ Expense vocabulary — one source of truth ═══
// These eight values are enforced by the `expenses_category_valid` CHECK
// (20260724002308_expenses.sql). Anything that writes a category — the vision
// route, the confirmation card, the dashboard quick-add — imports from here,
// so the app can never send the database a value it will reject.
//
// Deliberately free of zod/server imports: this file is pulled into client
// components.

// phone and insurance are first-class rather than folded into subscriptions /
// other: both are core contractor deductions, and the Phase B tax summary
// can't break them back out of a bucket once they've been flattened into one.
export const EXPENSE_CATEGORIES = [
  'food', 'fuel', 'supplies', 'tools', 'travel',
  'maintenance', 'subscriptions', 'phone', 'insurance', 'other',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** Display labels. Sentence case per Design Standard §9. */
export const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  food: 'Food',
  fuel: 'Fuel',
  supplies: 'Supplies',
  tools: 'Tools',
  travel: 'Travel',
  maintenance: 'Maintenance',
  subscriptions: 'Subscriptions',
  phone: 'Phone',
  insurance: 'Insurance',
  other: 'Other',
};

export const isExpenseCategory = (v: unknown): v is ExpenseCategory =>
  typeof v === 'string' && (EXPENSE_CATEGORIES as readonly string[]).includes(v);

/** What the AI returns and the confirmation card edits — the four fields. */
export interface ExpenseDraft {
  amount: number;
  category: ExpenseCategory;
  vendor: string | null;
  occurred_on: string | null; // ISO yyyy-mm-dd
}
