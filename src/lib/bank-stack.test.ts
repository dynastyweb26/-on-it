// The bank stack, joined: money out and money in in one queue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  depositStatus, ignoredEntries, resolveDeposit, restoreDeposit, sortEntries, stackCounter,
  stackEntries, type StackEntry,
} from './bank-stack';
import { seedReviewState, type BankReviewState } from './bank-tracking';
import type { ApiDeposit } from './bank-deposits';

const deposit = (over: Partial<ApiDeposit> = {}): ApiDeposit => ({
  id: 'dep-1',
  name: 'ZELLE FROM MIKE',
  merchant: 'Mike Davis',
  amount_cents: 45000,
  occurred_on: '2026-10-28',
  pending: false,
  removed: false,
  is_stripe_payout: false,
  payout: 'not_stripe',
  accounted: false,
  link: null,
  suggestion: null,
  ...over,
});

/** Two expenses: 2026-10-28 (wm-1028) and 2026-10-27 (co-1027). */
const state = (over: Partial<BankReviewState> = {}): BankReviewState => ({
  ...seedReviewState(),
  items: seedReviewState().items.slice(0, 2),
  ...over,
});

test('a deposit is open, ignored or done — never guessed', () => {
  assert.equal(depositStatus(deposit()), 'open');
  assert.equal(depositStatus(deposit({
    accounted: true, link: { kind: 'ignored', payment_id: null, classification: null },
  })), 'ignored');
  // Every other decided state is out of the stack entirely.
  for (const kind of ['recorded', 'linked', 'classified', 'stripe_payout'] as const) {
    assert.equal(depositStatus(deposit({
      accounted: true, link: { kind, payment_id: null, classification: null },
    })), 'done', kind);
  }
});

test('To review holds open expenses AND open deposits, newest first', () => {
  const entries = stackEntries(state(), [deposit()]);
  assert.equal(entries.length, 3);
  const kinds = entries.map((entry) => `${entry.kind}:${entry.id}`);
  // Both 2026-10-28 rows, then the 27th: the two sides interleave by date.
  assert.deepEqual(kinds, ['expense:wm-1028', 'deposit:dep-1', 'expense:co-1027']);
});

test('an ignored item is in the Ignored tab and nowhere else', () => {
  const ignoredExpense: BankReviewState = {
    ...state(), status: { 'wm-1028': 'ignored' },
  };
  const passedOn = deposit({
    accounted: true, link: { kind: 'ignored', payment_id: null, classification: null },
  });
  assert.deepEqual(stackEntries(ignoredExpense, [passedOn]).map((entry) => entry.id), ['co-1027']);
  assert.deepEqual(ignoredEntries(ignoredExpense, [passedOn]).map((entry) => entry.id),
    ['wm-1028', 'dep-1']);
});

test('a decided deposit never counts toward To review, the dots or the counter', () => {
  const decided = deposit({
    id: 'dep-2',
    accounted: true,
    link: { kind: 'recorded', payment_id: 'pay-1', classification: null },
  });
  assert.equal(stackEntries(state({ status: { 'wm-1028': 'added' } }), [decided]).length, 1);
});

test('the counter describes To review only: 2 of 8 with 8 to review', () => {
  assert.equal(stackCounter(2, 8), '2 of 8');
  // Ignored items are not part of the total, so 8 here is To review's own count.
  assert.equal(stackCounter(8, 8), '8 of 8');
  assert.equal(stackCounter(0, 0), '1 of 0');
});

test('a decision marks the deposit done, and a restore puts it back', () => {
  const one = deposit();
  const done = resolveDeposit([one], 'dep-1',
    { kind: 'ignored', payment_id: null, classification: null });
  assert.equal(depositStatus(done[0]), 'ignored');
  assert.equal(depositStatus(restoreDeposit(done, 'dep-1')[0]), 'open');
});

test('sorting is newest first and stable on a tie', () => {
  const a: StackEntry = { kind: 'expense', id: 'a', date: '2026-10-28', item: state().items[0] };
  const b: StackEntry = { kind: 'deposit', id: 'b', date: '2026-10-28', deposit: deposit() };
  const c: StackEntry = { kind: 'expense', id: 'c', date: '2026-10-29', item: state().items[1] };
  assert.deepEqual(sortEntries([a, b, c]).map((entry) => entry.id), ['c', 'a', 'b']);
});
