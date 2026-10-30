// ═══ Bank ledger states (phase 2 — real backend) ═══
// The app-side mirror of the CHECK constraints in
// supabase/migrations/20261030100000_plaid_money_out.sql. bank_state is what
// the bank says about a transaction; review_state is what the owner decided.
// The review stack's "Ignored" tab is review_state 'ignored' — there is no
// "hidden" state — and 'needs_review' is how a bank-side change to something
// already in the record surfaces (never a silent overwrite).
//
// Pure: no network, no Supabase client, no writes.
import type { ExpenseCategory } from './expenses';

export const BANK_STATES = ['pending', 'posted', 'removed'] as const;
export type BankState = (typeof BANK_STATES)[number];

export const REVIEW_STATES = ['new', 'added', 'already', 'ignored', 'needs_review'] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

/** Still waiting on the owner: the only two states the stack shows. */
export const isOpenReviewState = (state: ReviewState): boolean =>
  state === 'new' || state === 'needs_review';

/** Decided: the transaction counts through the expense it points at. */
export const holdsExpense = (state: ReviewState): boolean =>
  state === 'added' || state === 'already';

/** A row the bank pulled, reversed or re-priced while it was already recorded. */
export const isBankChange = (state: BankState): boolean =>
  state === 'removed' || state === 'pending';

/** The canonical row an expense is created from. */
export type BankTransaction = {
  id: string;
  merchant: string | null;
  description: string;
  amount: number;
  occurredOn: string;
  category: ExpenseCategory | null;
  bankState: BankState;
  reviewState: ReviewState;
  expenseId: string | null;
};

/** Display name: the normalised vendor, falling back to what the bank printed. */
export const vendorOf = (txn: Pick<BankTransaction, 'merchant' | 'description'>): string =>
  (txn.merchant ?? '').trim() || txn.description.trim();
