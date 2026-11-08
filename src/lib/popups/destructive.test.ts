import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  balanceAfterDeletingPayment, clientDeleteConsequence, clientDocCountLabel, convertActionLabel,
  deleteActionLabel, deleteNeedsTyped, EXPENSE_DELETE_CONSEQUENCE, invoiceDeleteConsequence,
  paymentDeleteConsequence, templateHasContent,
} from './destructive';
import { popupFailure } from './failure';

test('balanceAfterDeletingPayment: the amount comes back, never below zero', () => {
  assert.equal(balanceAfterDeletingPayment(0, 85), 85);
  assert.equal(balanceAfterDeletingPayment(40, 85), 125);
  assert.equal(balanceAfterDeletingPayment(0, 0), 0);
  assert.equal(balanceAfterDeletingPayment(-5, 5), 0);
});

test('paymentDeleteConsequence: names the document and the restored balance', () => {
  assert.equal(paymentDeleteConsequence('INV-0007', 0, 85), 'INV-0007 goes back to $85.00 due.');
});

test('convertActionLabel: the button carries the figure', () => {
  assert.equal(convertActionLabel('$1,200.00'), 'Convert to an invoice · $1,200.00');
});

test('templateHasContent: an untouched template closes without asking', () => {
  assert.equal(templateHasContent(null), false);
  assert.equal(templateHasContent({}), false);
  assert.equal(templateHasContent({ items: [], line_items: [], extra: '   ' }), false);
});

// ── Board 1 · D1/D2/D3 (the delete confirms) ──

test('D1/D2: the go button carries the figure', () => {
  assert.equal(deleteActionLabel('Invoice', '$200.00'), 'Delete invoice · $200.00');
  assert.equal(deleteActionLabel('Estimate', '$1,200.00'), 'Delete estimate · $1,200.00');
  assert.equal(deleteActionLabel('expense', '$142.18'), 'Delete expense · $142.18');
});

test('D1: the typed word is asked for only on a record that already left', () => {
  for (const status of ['sent', 'paid', 'overdue']) assert.equal(deleteNeedsTyped(status), true);
  for (const status of ['draft', null, undefined, 'void']) assert.equal(deleteNeedsTyped(status), false);
});

test('D1: a failure says the document is still in the list', () => {
  const consequence = invoiceDeleteConsequence('INV-0007');
  assert.equal(consequence, 'Nothing was deleted. INV-0007 is still in your list.');
  const failure = popupFailure(new Error('Failed to fetch'), consequence);
  assert.equal(failure.title, "You're offline");
  assert.equal(
    failure.body,
    'Nothing was deleted. INV-0007 is still in your list. No connection. Check your signal and try again.',
  );
});

test('D2: a failure says nothing was deleted, then names the cause', () => {
  assert.equal(EXPENSE_DELETE_CONSEQUENCE, 'Nothing was deleted.');
  const failure = popupFailure({ status: 500 }, EXPENSE_DELETE_CONSEQUENCE);
  assert.equal(failure.title, 'Something broke on our end');
  assert.equal(failure.body, 'Nothing was deleted. Something broke on our end, not yours. Try again in a minute.');
});

test('D3: a failure says the client is still there, and the figure is the count', () => {
  assert.equal(clientDeleteConsequence('Brandon'), 'Nothing was deleted. Brandon is still in your clients.');
  assert.equal(clientDocCountLabel(4, 1), '4 invoices · 1 estimate stay');
  assert.equal(clientDocCountLabel(1, 0), '1 invoice · 0 estimates stay');
  assert.equal(clientDocCountLabel(0, 0), '0 invoices · 0 estimates stay');
});

test('templateHasContent: a client, an item or extra info asks first', () => {
  assert.equal(templateHasContent({ client: { name: 'Brandon' } }), true);
  assert.equal(templateHasContent({ client_name: 'Brandon' }), true);
  assert.equal(templateHasContent({ items: [{ name: 'Car wash' }] }), true);
  assert.equal(templateHasContent({ line_items: [{ name: 'Car wash' }] }), true);
  assert.equal(templateHasContent({ extra: 'Due Friday' }), true);
});
