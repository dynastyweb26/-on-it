// ═══ GET /api/plaid/transactions — the payload, proven pure ═══
// The route reads through the session client (RLS) and hands its rows here.
// Only the allow-listed columns exist in this module's types, so a secret or a
// raw Plaid id cannot travel to the screen even by accident.
import {
  parseCents, suggestMatch, expenseCategoryFromPlaid,
  type MatchExpense, type SuggestedMatch,
} from './match';
import type { ExpenseCategory } from '../expenses';

/** Every column the review stack reads. Nothing else is ever selected. */
export const ROW_COLUMNS = [
  'id', 'description', 'merchant', 'amount', 'occurred_on',
  'bank_state', 'review_state', 'expense_id', 'category',
] as const;

export const ROW_SELECT =
  'id, description, merchant, amount, occurred_on, bank_state, review_state, expense_id, category, ' +
  'plaid_accounts(name, mask, plaid_items(institution_name))';

/** The expense columns the matcher needs — never the whole expense row. */
export const EXPENSE_COLUMNS = ['id', 'vendor', 'description', 'amount', 'spent_on', 'category'] as const;
export const EXPENSE_SELECT = 'id, vendor, description, amount, spent_on, category';

export type BankRowRow = {
  id: string;
  description: string;
  merchant: string | null;
  amount: string | number;
  occurred_on: string;
  bank_state: string;
  review_state: string;
  expense_id: string | null;
  category: string | null;
  plaid_accounts: {
    name: string | null;
    mask: string | null;
    plaid_items: { institution_name: string | null } | null;
  } | null;
};

export type OpenBankRow = {
  id: string;
  account: { name: string; mask: string };
  merchant: string | null;
  description: string;
  /** Integer cents: the only form money leaves this route in. */
  amount_cents: number;
  occurred_on: string;
  bank_state: string;
  review_state: string;
  expense_id: string | null;
  category: ExpenseCategory;
  match: { expense_id: string; vendor: string; amount_cents: number; date: string } | null;
};

const OPEN_STATES = new Set(['new', 'needs_review']);

export const openBankRows = (rows: BankRowRow[]): BankRowRow[] =>
  rows.filter((row) => OPEN_STATES.has(row.review_state));

/** "Chase ••4821" when the nested item came back, else the account's own name. */
export function accountLine(account: BankRowRow['plaid_accounts']): { name: string; mask: string } {
  const mask = (account?.mask ?? '').trim();
  const institution = (account?.plaid_items?.institution_name ?? '').trim();
  const name = (account?.name ?? '').trim();
  return {
    name: institution ? `${institution}${mask ? ` ••${mask}` : ''}` : (name || 'Bank account'),
    mask,
  };
}

const publicMatch = (match: SuggestedMatch | null) =>
  match
    ? { expense_id: match.expense_id, vendor: match.vendor, amount_cents: match.amount_cents, date: match.date }
    : null;

/**
 * Rows → the screen's payload. A row whose amount cannot be parsed exactly is
 * dropped rather than shown with a guessed figure.
 */
export function transactionsResponse(
  rows: BankRowRow[],
  expenses: MatchExpense[],
  linkedExpenseIds: ReadonlySet<string> = new Set(),
): { items: OpenBankRow[] } {
  const items: OpenBankRow[] = [];
  for (const row of openBankRows(rows)) {
    const amountCents = parseCents(row.amount);
    if (amountCents === null || amountCents <= 0) continue;
    const account = accountLine(row.plaid_accounts);
    items.push({
      id: row.id,
      account,
      merchant: (row.merchant ?? '').trim() || null,
      description: row.description,
      amount_cents: amountCents,
      occurred_on: row.occurred_on,
      bank_state: row.bank_state,
      review_state: row.review_state,
      expense_id: row.expense_id,
      category: expenseCategoryFromPlaid(row.category, row.description),
      match: publicMatch(suggestMatch(
        {
          amount_cents: amountCents,
          occurred_on: row.occurred_on,
          merchant: row.merchant,
          description: row.description,
        },
        expenses,
        linkedExpenseIds,
      )),
    });
  }
  return { items };
}
