// ═══ The real review queue on the client: plan, mapping, request body ═══
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  matchStrip, reviewBody, rollbackAction, rowToItem, transactionsPlan,
  type ApiReviewRow,
} from './bank-review';
import { amountOf, itemAccount, sumCents, type BankItem } from './bank-tracking';

const ROW: ApiReviewRow = {
  id: 'row-1',
  account: { name: 'Chase ••4821', mask: '4821' },
  merchant: 'Costco Wholesale',
  description: 'COSTCO WHOLESALE #123',
  amount_cents: 43298,
  occurred_on: '2026-10-27',
  bank_state: 'posted',
  review_state: 'new',
  expense_id: null,
  category: 'supplies',
  match: { expense_id: 'exp-1', vendor: 'Costco Wholesale', amount_cents: 43298, date: '2026-10-28' },
};

test('GET plan: 404 is the gate, a row list is the queue, junk is an error', () => {
  assert.equal(transactionsPlan(404, { error: 'not found' }).kind, 'none');
  const ok = transactionsPlan(200, {
    items: [ROW, { nope: true }],
    counts: { added: 2, already: 1, ignored: 3 },
  });
  assert.equal(ok.kind, 'rows');
  if (ok.kind === 'rows') {
    assert.equal(ok.rows.length, 1, 'malformed rows are dropped');
    assert.deepEqual(ok.counts, { added: 2, already: 1, ignored: 3 });
  }
  assert.equal(transactionsPlan(500, { error: 'x' }).kind, 'error');
  assert.equal(transactionsPlan(200, { items: 'nope' }).kind, 'error');
});

test('counts are never negative or missing', () => {
  const plan = transactionsPlan(200, { items: [], counts: { added: -1, ignored: 'many' } });
  assert.equal(plan.kind, 'rows');
  if (plan.kind === 'rows') assert.deepEqual(plan.counts, { added: 0, already: 0, ignored: 0 });
});

test('a row maps onto a card: cents, account line and the match strip', () => {
  const item = rowToItem(ROW);
  assert.equal(item.id, 'row-1');
  assert.equal(item.kind, 'expense');
  assert.equal(item.amount, 432.98);
  assert.equal(item.cents, 43298);
  assert.equal(amountOf(item), 43298, 'totals use the exact cents');
  assert.equal(itemAccount(item), 'Chase ••4821');
  assert.equal(item.match, 'Costco Wholesale · Oct 28 · $432.98');
  assert.equal(matchStrip(ROW.match!), item.match);
  assert.equal(rowToItem({ ...ROW, match: null }).match, undefined);
});

test('a merchant-less row falls back to what the bank printed', () => {
  const item = rowToItem({ ...ROW, merchant: null, match: null });
  assert.equal(item.merchant, 'COSTCO WHOLESALE #123');
});

test('the body sends an amount only when it was edited', () => {
  const item = rowToItem(ROW);
  assert.deepEqual(reviewBody(ROW, item, 'add'), { transaction_id: 'row-1', action: 'add' });
  const edited: BankItem = { ...item, amount: 400, cents: 40000 };
  assert.deepEqual(reviewBody(ROW, edited, 'add'), {
    transaction_id: 'row-1', action: 'add', amount_cents: 40000,
  });
  const recategorised: BankItem = { ...item, category: 'tools' };
  assert.deepEqual(reviewBody(ROW, recategorised, 'add'), {
    transaction_id: 'row-1', action: 'add', category: 'tools',
  });
  // Decided actions carry the id and nothing else.
  assert.deepEqual(reviewBody(ROW, item, 'ignore'), { transaction_id: 'row-1', action: 'ignore' });
  assert.deepEqual(reviewBody(ROW, item, 'already'), { transaction_id: 'row-1', action: 'already' });
});

test('a failed write rolls back to what the card showed before', () => {
  assert.deepEqual(rollbackAction('open', 'row-1'), { type: 'restore', id: 'row-1' });
  assert.deepEqual(rollbackAction('added', 'row-1'), { type: 'restore', id: 'row-1' });
  assert.deepEqual(rollbackAction('ignored', 'row-1'), { type: 'ignore', id: 'row-1' });
});

test('unaccounted totals stay exact across rows', () => {
  const items = [
    rowToItem(ROW),
    rowToItem({ ...ROW, id: 'row-2', amount_cents: 0.1 * 100, match: null }),
  ];
  assert.equal(sumCents(items), 43308);
});
