// ═══ Plaid money-out sync reducer ═══
// Pure page → writes: posted-only, money-out-only, window, dedupe, and the
// review-state rules (nothing already recorded changes silently).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planTransactionPage, type ExistingBankRow, type PlaidSyncTransaction, type PlanInput,
} from './sync-reducer';

const USER = 'user-1';
const ITEM = 'item-1';
const ACCOUNT = 'acct-uuid-1';
const WINDOW = '2026-10-01';

const txn = (over: Partial<PlaidSyncTransaction> = {}): PlaidSyncTransaction => ({
  transaction_id: 't1',
  account_id: 'plaid-acct-1',
  pending: false,
  amount: 30.38,
  name: 'COSTCO WHOLESALE #123',
  merchant_name: 'Costco Wholesale',
  authorized_date: '2026-10-27',
  date: '2026-10-28',
  pending_transaction_id: null,
  personal_finance_category: { primary: 'FOOD_AND_DRINK' },
  ...over,
});

const input = (over: Partial<PlanInput> = {}): PlanInput => ({
  userId: USER,
  itemId: ITEM,
  added: [],
  modified: [],
  removed: [],
  existing: [],
  trackedAccountIds: { 'plaid-acct-1': ACCOUNT },
  windowStart: WINDOW,
  removedAt: '2026-10-31T12:00:00.000Z',
  ...over,
});

const existing = (over: Partial<ExistingBankRow> = {}): ExistingBankRow => ({
  id: 'row-1',
  plaid_transaction_id: 't1',
  bank_state: 'posted',
  review_state: 'new',
  expense_id: null,
  ...over,
});

test('a posted money-out charge becomes one insert with the bank vendor and date', () => {
  const plan = planTransactionPage(input({ added: [txn()] }));
  assert.equal(plan.inserts.length, 1);
  assert.equal(plan.updates.length, 0);
  assert.deepEqual(plan.inserts[0], {
    user_id: USER,
    item_id: ITEM,
    account_id: ACCOUNT,
    plaid_transaction_id: 't1',
    description: 'COSTCO WHOLESALE #123',
    merchant: 'Costco Wholesale',
    amount: 30.38,
    occurred_on: '2026-10-27', // authorized_date wins
    authorized_on: '2026-10-27',
    category: 'FOOD_AND_DRINK',
    bank_state: 'posted',
    review_state: 'new',
  });
});

test('money in is skipped', () => {
  // Plaid is negative for money in.
  const plan = planTransactionPage(input({ added: [txn({ amount: -1200 })] }));
  assert.equal(plan.inserts.length, 0);
  assert.equal(plan.skipped.moneyIn, 1);
});

test('pending transactions are skipped', () => {
  const plan = planTransactionPage(input({ added: [txn({ pending: true })] }));
  assert.equal(plan.inserts.length, 0);
  assert.equal(plan.skipped.pending, 1);
});

test('transactions before the link window are not staged', () => {
  const plan = planTransactionPage(
    input({ added: [txn({ authorized_date: null, date: '2026-09-30' })] }),
  );
  assert.equal(plan.inserts.length, 0);
  assert.equal(plan.skipped.outsideWindow, 1);
});

test('a modification of a row we already hold applies even outside the window', () => {
  const plan = planTransactionPage(input({
    modified: [txn({ amount: 31.00, authorized_date: null, date: '2026-09-30' })],
    existing: [existing()],
  }));
  assert.equal(plan.inserts.length, 0);
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0].patch.amount, 31);
});

test('an untracked account produces no bank rows', () => {
  const plan = planTransactionPage(input({
    added: [txn({ account_id: 'plaid-other' })],
    trackedAccountIds: { 'plaid-acct-1': ACCOUNT },
  }));
  assert.equal(plan.inserts.length, 0);
  assert.equal(plan.skipped.untrackedAccount, 1);
});

test('an added update on a new row updates it and keeps it new', () => {
  const plan = planTransactionPage(input({ added: [txn()], existing: [existing()] }));
  assert.equal(plan.inserts.length, 0);
  assert.equal(plan.updates.length, 1);
  const patch = plan.updates[0].patch;
  assert.equal(patch.amount, 30.38);
  assert.equal(patch.review_state, undefined); // stayed 'new'
});

test('a change to an already-added row is never silent: needs_review', () => {
  const plan = planTransactionPage(input({
    modified: [txn({ amount: 54.49 })],
    existing: [existing({ review_state: 'added', expense_id: 'expense-1' })],
  }));
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0].patch.review_state, 'needs_review');
  assert.equal(plan.updates[0].patch.amount, 54.49);
  // The reducer never touches expense_id; the expense link survives.
  assert.equal('expense_id' in plan.updates[0].patch, false);
});

test('a change to an already-recorded row is never silent: needs_review', () => {
  const plan = planTransactionPage(input({
    modified: [txn({ amount: 99 })],
    existing: [existing({ review_state: 'already', expense_id: 'expense-2' })],
  }));
  assert.equal(plan.updates[0].patch.review_state, 'needs_review');
});

test('a bank removal of an added row keeps the expense and asks for review', () => {
  const plan = planTransactionPage(input({
    removed: [{ transaction_id: 't1' }],
    existing: [existing({ review_state: 'added', expense_id: 'expense-1' })],
  }));
  assert.equal(plan.updates.length, 1);
  const patch = plan.updates[0].patch;
  assert.equal(patch.bank_state, 'removed');
  assert.equal(patch.removed_at, '2026-10-31T12:00:00.000Z');
  assert.equal(patch.review_state, 'needs_review');
  assert.equal('expense_id' in patch, false);
});

test('a bank removal of a new or ignored row only marks it removed', () => {
  for (const review_state of ['new', 'ignored'] as const) {
    const plan = planTransactionPage(input({
      removed: [{ transaction_id: 't1' }],
      existing: [existing({ review_state })],
    }));
    assert.equal(plan.updates.length, 1);
    assert.equal(plan.updates[0].patch.bank_state, 'removed');
    assert.equal(plan.updates[0].patch.review_state, undefined);
  }
});

test('a removed id we never saw is a no-op', () => {
  const plan = planTransactionPage(input({ removed: [{ transaction_id: 'ghost' }] }));
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.skipped.unknownRemoved, 1);
});

test('pending → posted updates the pending row instead of adding a duplicate', () => {
  const plan = planTransactionPage(input({
    added: [txn({ transaction_id: 'posted-1', pending_transaction_id: 'pending-1' })],
    existing: [existing({ plaid_transaction_id: 'pending-1', bank_state: 'pending' })],
  }));

  assert.equal(plan.inserts.length, 0);
  assert.equal(plan.updates.length, 1);
  const patch = plan.updates[0].patch;
  assert.equal(patch.plaid_transaction_id, 'posted-1');
  assert.equal(patch.bank_state, 'posted');
  assert.equal(patch.removed_at, null);
  assert.equal(plan.updates[0].id, 'row-1');
});

test('a paid charge that was already recorded still lands in needs_review', () => {
  const plan = planTransactionPage(input({
    added: [txn({ transaction_id: 'posted-1', pending_transaction_id: 'pending-1' })],
    existing: [existing({
      plaid_transaction_id: 'pending-1',
      bank_state: 'pending',
      review_state: 'added',
      expense_id: 'expense-1',
    })],
  }));
  assert.equal(plan.updates[0].patch.review_state, 'needs_review');
});

test('dedupe: the same Plaid id twice in one page yields one insert', () => {
  const plan = planTransactionPage(input({
    added: [txn(), txn()],
    modified: [txn({ amount: 31.00 })],
  }));
  assert.equal(plan.inserts.length, 1);
  assert.equal(plan.inserts[0].amount, 31);
});

test('a pending transaction added and removed in one page is not inserted', () => {
  const plan = planTransactionPage(input({
    added: [txn()],
    removed: [{ transaction_id: 't1' }],
  }));
  assert.equal(plan.inserts.length, 0);
  assert.equal(plan.skipped.removedBeforeInsert, 1);
});

test('a row added then removed in one page keeps review state new for a decided row', () => {
  // Removed arrives first for an existing row, then a modified re-appears as
  // posted in the same page: the final state is what counts.
  const plan = planTransactionPage(input({
    modified: [txn()],
    removed: [{ transaction_id: 't1' }],
    existing: [existing({ review_state: 'added', expense_id: 'expense-1' })],
  }));
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0].patch.bank_state, 'removed');
  assert.equal(plan.updates[0].patch.review_state, 'needs_review');
});

test('vendor falls back to the bank description when merchant_name is absent', () => {
  const plan = planTransactionPage(input({ added: [txn({ merchant_name: null })] }));
  assert.equal(plan.inserts[0].merchant, null);
  assert.equal(plan.inserts[0].description, 'COSTCO WHOLESALE #123');
});

test('amounts are rounded to cents and text is capped to the column limits', () => {
  const plan = planTransactionPage(input({
    added: [txn({
      amount: 12.345,
      name: 'x'.repeat(400),
      merchant_name: 'm'.repeat(300),
      personal_finance_category: { primary: 'p'.repeat(80) },
    })],
  }));
  assert.equal(plan.inserts[0].amount, 12.35);
  assert.equal(plan.inserts[0].description.length, 300);
  assert.equal(plan.inserts[0].merchant?.length, 200);
  assert.equal(plan.inserts[0].category?.length, 60);
});

test('an empty page produces no writes and all-zero skips', () => {
  const plan = planTransactionPage(input());
  assert.deepEqual(plan.inserts, []);
  assert.deepEqual(plan.updates, []);
  assert.deepEqual(plan.skipped, {
    pending: 0, moneyIn: 0, outsideWindow: 0, untrackedAccount: 0,
    unknownRemoved: 0, removedBeforeInsert: 0,
  });
});
