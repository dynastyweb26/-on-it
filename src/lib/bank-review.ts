// ═══ The real review queue, on the client ═══
// The provider fetches; these are the rules, so they are testable without a
// browser: what GET /api/plaid/transactions means, how one row becomes a BankItem
// (so every card keeps working), the body an action posts, and how a failed write
// rolls the optimistic move back. No fetch, no Supabase, no /api literal here —
// the URLs live in the provider, where the guard counts them.
import {
  amountOf, formatDay, formatMoney,
  type BankAction, type BankItem, type BankItemStatus,
} from './bank-tracking';
import type { ExpenseCategory } from './expenses';

export type ApiMatch = {
  expense_id: string;
  vendor: string;
  amount_cents: number;
  date: string;
};

export type ApiReviewRow = {
  id: string;
  account: { name: string; mask: string };
  merchant: string | null;
  description: string;
  amount_cents: number;
  occurred_on: string;
  bank_state: string;
  review_state: string;
  expense_id: string | null;
  category: ExpenseCategory;
  match: ApiMatch | null;
};

export type ApiCounts = { added: number; already: number; ignored: number };

export type TransactionsPlan =
  | { kind: 'none' }
  | { kind: 'rows'; rows: ApiReviewRow[]; counts: ApiCounts }
  | { kind: 'error' };

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const isRow = (value: unknown): value is ApiReviewRow => {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string'
    && row.id.length > 0
    && typeof row.amount_cents === 'number'
    && Number.isSafeInteger(row.amount_cents)
    && row.amount_cents > 0
    && typeof row.occurred_on === 'string'
    && typeof row.description === 'string';
};

/**
 * What a GET /api/plaid/transactions response means. 404 is the preview gate
 * (the stack keeps its current behaviour); anything else that is not a row list
 * is an error, never an empty queue pretending everything is resolved.
 */
export function transactionsPlan(status: number, body: unknown): TransactionsPlan {
  if (status === 404) return { kind: 'none' };
  if (status >= 200 && status < 300) {
    const payload = body as { items?: unknown; counts?: unknown } | null;
    if (Array.isArray(payload?.items)) {
      const counts = (payload?.counts ?? {}) as Record<string, unknown>;
      return {
        kind: 'rows',
        rows: payload.items.filter(isRow),
        counts: {
          added: isCount(counts.added) ? counts.added : 0,
          already: isCount(counts.already) ? counts.already : 0,
          ignored: isCount(counts.ignored) ? counts.ignored : 0,
        },
      };
    }
  }
  return { kind: 'error' };
}

/** "Costco Wholesale · Oct 27 · $432.98" — the Possible match strip. */
export const matchStrip = (match: ApiMatch): string =>
  `${match.vendor} · ${formatDay(match.date)} · ${formatMoney(match.amount_cents / 100)}`;

/** One real bank row → the item every card, the dot and Unaccounted already use. */
export function rowToItem(row: ApiReviewRow): BankItem {
  return {
    id: row.id,
    kind: 'expense',
    merchant: (row.merchant ?? '').trim() || row.description,
    amount: row.amount_cents / 100,
    cents: row.amount_cents,
    date: row.occurred_on,
    accountId: '',
    accountLabel: row.account.name,
    category: row.category,
    match: row.match ? matchStrip(row.match) : undefined,
    receipt: false,
  };
}

export type ReviewAction = 'add' | 'already' | 'ignore' | 'restore';

/**
 * The POST body. The amount and the category travel only when the owner changed
 * them on the card, so the server's bank-row copy stays the default.
 */
export function reviewBody(row: ApiReviewRow, item: BankItem, action: ReviewAction): Record<string, unknown> {
  const body: Record<string, unknown> = { transaction_id: row.id, action };
  if (action === 'add') {
    const cents = amountOf(item);
    if (cents !== row.amount_cents) body.amount_cents = cents;
    if (item.category !== row.category) body.category = item.category;
  }
  return body;
}

/** The move that undoes an optimistic decision, whatever it was before. */
export function rollbackAction(previous: BankItemStatus, id: string): BankAction {
  return previous === 'ignored' ? { type: 'ignore', id } : { type: 'restore', id };
}
