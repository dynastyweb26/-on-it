// ═══ GET /api/plaid/transactions — the payload, proven pure ═══
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPENSE_COLUMNS, ROW_COLUMNS, ROW_SELECT, accountLine, isOpenBankRow, openBankRows,
  transactionsResponse, type BankRowRow,
} from './transactions-view';

const ROW: BankRowRow = {
  id: 'row-1',
  description: 'COSTCO WHOLESALE #123',
  merchant: 'Costco Wholesale',
  amount: '432.98',
  occurred_on: '2026-10-27',
  bank_state: 'posted',
  review_state: 'new',
  expense_id: null,
  category: 'GENERAL_MERCHANDISE',
  plaid_accounts: {
    name: 'Business Checking',
    mask: '4821',
    plaid_items: { institution_name: 'Chase' },
  },
};

const EXPENSE = {
  id: 'exp-1',
  vendor: 'Costco Wholesale',
  description: 'Supplies',
  amount: '432.98',
  spent_on: '2026-10-28',
  category: 'supplies',
};

test('a row becomes exactly what the stack reads, in integer cents', () => {
  const { items } = transactionsResponse([ROW], [EXPENSE]);
  assert.equal(items.length, 1);
  const item = items[0];
  assert.equal(item.id, 'row-1');
  assert.equal(item.amount_cents, 43298);
  assert.equal(item.account.name, 'Chase ••4821');
  assert.equal(item.category, 'supplies', 'the mapped category the card shows');
  assert.equal(item.merchant, 'Costco Wholesale');
  assert.equal(item.review_state, 'new');
  assert.deepEqual(item.match, {
    expense_id: 'exp-1',
    vendor: 'Costco Wholesale',
    amount_cents: 43298,
    date: '2026-10-28',
  });
});

test('decided rows are never in the payload', () => {
  for (const state of ['added', 'already', 'ignored']) {
    const { items } = transactionsResponse([{ ...ROW, review_state: state }], []);
    assert.equal(items.length, 0, state);
  }
  assert.equal(openBankRows([ROW, { ...ROW, review_state: 'needs_review' }]).length, 2);
});

test('an amount that cannot be read exactly is dropped, not guessed', () => {
  const { items } = transactionsResponse([{ ...ROW, amount: 'abc' }, { ...ROW, amount: '0' }], []);
  assert.deepEqual(items, []);
});

test('a removed charge never reaches the stack', () => {
  const removed = { ...ROW, bank_state: 'removed', removed_at: '2026-10-29T10:00:00.000Z' };
  assert.deepEqual(transactionsResponse([removed], []).items, []);
  // Either half of the pair being present is enough to keep it out.
  assert.deepEqual(transactionsResponse([{ ...ROW, removed_at: '2026-10-29' }], []).items, []);
  assert.deepEqual(transactionsResponse([{ ...ROW, bank_state: 'removed' }], []).items, []);
  assert.equal(isOpenBankRow(ROW), true);
  assert.equal(isOpenBankRow({ ...ROW, bank_state: 'removed' }), false);
});

test('the select lists no secret: no token, Plaid id, cursor or error text', () => {
  for (const column of ['access_token_enc', 'plaid_transaction_id', 'sync_cursor', 'last_sync_error']) {
    assert.equal(ROW_SELECT.includes(column), false, `${column} must never be selected`);
  }
  assert.ok(ROW_COLUMNS.includes('amount') && ROW_COLUMNS.includes('review_state'));
  assert.deepEqual([...EXPENSE_COLUMNS], ['id', 'vendor', 'description', 'amount', 'spent_on', 'category']);
  assert.match(ROW_SELECT, /plaid_accounts\(name, mask, plaid_items\(institution_name\)\)$/);
});

test('a missing account still prints something usable', () => {
  assert.deepEqual(accountLine(null), { name: 'Bank account', mask: '' });
  assert.equal(accountLine({ name: 'Card', mask: null, plaid_items: null }).name, 'Card');
  const { items } = transactionsResponse([{ ...ROW, plaid_accounts: null }], []);
  assert.equal(items[0].account.name, 'Bank account');
});
