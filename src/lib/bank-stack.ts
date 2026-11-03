// ═══ The one Bank activity queue ═══
// Money out and money in share one stack: expenses the bank saw, and deposits
// nothing has decided yet. This module is the join, and the only place the two
// tabs' membership rule lives.
//
// Why a join and not "two stacks": the counter, the swipe deck and the tabs all
// have to agree, and CHANGES.md gives them one number ("2 of 8", where To review
// says 8). Two independent lists would each count themselves.
//
// A deposit is decided when a link row or an other_income row names it
// (lib/bank-deposits ApiDeposit.accounted). Ignored is the one decided state
// that stays restorable, so it is the one that still belongs in the sheet.
import type { ApiDeposit } from './bank-deposits';
import {
  ignoredQueue, reviewQueue, type BankItem, type BankReviewState,
} from './bank-tracking';

/** One row in the stack, whichever side of the ledger it came from. */
export type StackEntry =
  | { kind: 'expense'; id: string; date: string; item: BankItem }
  | { kind: 'deposit'; id: string; date: string; deposit: ApiDeposit };

export type DepositStatus = 'open' | 'ignored' | 'done';

/** open = To review, ignored = the Ignored tab, done = counted somewhere. */
export function depositStatus(deposit: ApiDeposit): DepositStatus {
  if (!deposit.accounted) return 'open';
  return deposit.link?.kind === 'ignored' ? 'ignored' : 'done';
}

const expenseEntry = (item: BankItem): StackEntry =>
  ({ kind: 'expense', id: item.id, date: item.date, item });

const depositEntry = (deposit: ApiDeposit): StackEntry =>
  ({ kind: 'deposit', id: deposit.id, date: deposit.occurred_on, deposit });

/** Newest first, and a stable order past that (expenses win an exact tie). */
export function sortEntries(entries: StackEntry[]): StackEntry[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => (a.entry.date === b.entry.date
      ? a.index - b.index
      : a.entry.date < b.entry.date ? 1 : -1))
    .map(({ entry }) => entry);
}

/**
 * To review: every open expense plus every undecided deposit.
 * Ignored items are never in here — that is what keeps them out of the counter,
 * the dots and the pinned row (CHANGES.md · item 2).
 */
export function stackEntries(state: BankReviewState, deposits: ApiDeposit[]): StackEntry[] {
  const expenses = reviewQueue(state).map(expenseEntry);
  const money_in = deposits
    .filter((deposit) => depositStatus(deposit) === 'open')
    .map(depositEntry);
  return sortEntries([...expenses, ...money_in]);
}

/** The Ignored tab: passed-on expenses and passed-on deposits, both restorable. */
export function ignoredEntries(state: BankReviewState, deposits: ApiDeposit[]): StackEntry[] {
  const expenses = ignoredQueue(state).map(expenseEntry);
  const money_in = deposits
    .filter((deposit) => depositStatus(deposit) === 'ignored')
    .map(depositEntry);
  return sortEntries([...expenses, ...money_in]);
}

/** The counter only ever describes To review: "2 of 8" with 8 to review. */
export const stackCounter = (position: number, toReview: number): string =>
  `${Math.max(1, position)} of ${Math.max(position, toReview)}`;

/** What a decision on a deposit leaves behind: every decided state is 'done'. */
export function resolveDeposit(deposits: ApiDeposit[], id: string, link: ApiDeposit['link']): ApiDeposit[] {
  return deposits.map((deposit) => (deposit.id === id
    ? { ...deposit, accounted: true, link }
    : deposit));
}

/** A restored deposit goes back to undecided. */
export function restoreDeposit(deposits: ApiDeposit[], id: string): ApiDeposit[] {
  return deposits.map((deposit) => (deposit.id === id
    ? { ...deposit, accounted: false, link: null }
    : deposit));
}

/** Reading order for the sheet: the label above each entry's name. */
export const entryName = (entry: StackEntry): string =>
  entry.kind === 'deposit' ? (entry.deposit.merchant || entry.deposit.name) : entry.item.merchant;

/** What kind of card the arrows are sitting under. Only reported, never used to
 *  gate them: every kind keeps the arrows (stack-nav.test.ts). */
export type StackCardKind = 'expense' | 'deposit' | 'stripe' | 'pending' | 'removed';

export function cardKindOf(entry: StackEntry | null): StackCardKind {
  if (!entry || entry.kind === 'expense') return 'expense';
  const deposit = entry.deposit;
  if (deposit.removed) return 'removed';
  if (deposit.pending) return 'pending';
  if (deposit.payout === 'ambiguous') return 'stripe';
  return 'deposit';
}
