import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPayCard, payCardActions, payCardLine, payCardProgress, payCardTitle } from './payment-card';

const dollars = (n: number) => `$${n.toFixed(2)}`;

const base = {
  invoiceId: 'inv-1',
  invoiceNo: 12,
  clientName: 'Maria',
  amount: 25,
  method: 'zelle',
  paidAt: '2026-11-08T05:00:00.000Z',
  paymentId: 'pay-1',
  total: 100,
  left: 75,
};

test('a partial payment is a recorded payment with what is left', () => {
  const card = buildPayCard(base);
  assert.equal(card.kind, 'recorded');
  assert.equal(payCardTitle(card.kind), 'Payment recorded');
  assert.equal(payCardLine(card, dollars), '$75.00 left');
  assert.equal(Math.round(payCardProgress(card, 100)), 25);
});

test('a balance that reaches zero is paid in full, with no second action', () => {
  const card = buildPayCard({ ...base, amount: 75, left: 0 });
  assert.equal(card.kind, 'paid');
  assert.equal(payCardTitle(card.kind), 'Paid in full');
  assert.equal(payCardLine(card, dollars), 'Nothing left to collect.');
  assert.equal(payCardProgress(card, 100), 100);
  assert.deepEqual(payCardActions(card), ['open', 'undo']);
});

test('a deposit keeps its own card because the balance is still due', () => {
  const card = buildPayCard({ ...base, amount: 50, left: 50, depositOnly: true });
  assert.equal(card.kind, 'deposit');
  assert.equal(payCardLine(card, dollars), '');
  // No button at all: the balance is collected on completion.
  assert.deepEqual(payCardActions(card), []);
});

test('an unreadable ledger row never offers Undo', () => {
  const card = buildPayCard({ ...base, paymentId: null });
  assert.deepEqual(payCardActions(card), ['open']);
});

test('an overpaid invoice does not render a negative balance', () => {
  const card = buildPayCard({ ...base, amount: 150, left: -20 });
  assert.equal(card.left, 0);
  assert.equal(card.kind, 'paid');
  assert.equal(payCardProgress(card, 100), 100);
});

test('a zero total cannot divide by zero', () => {
  const card = buildPayCard({ ...base, left: 10 });
  assert.equal(payCardProgress(card, 0), 0);
});
