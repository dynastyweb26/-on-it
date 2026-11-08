import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  balanceAfterDeletingPayment, convertActionLabel, paymentDeleteConsequence, templateHasContent,
} from './destructive';

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

test('templateHasContent: a client, an item or extra info asks first', () => {
  assert.equal(templateHasContent({ client: { name: 'Brandon' } }), true);
  assert.equal(templateHasContent({ client_name: 'Brandon' }), true);
  assert.equal(templateHasContent({ items: [{ name: 'Car wash' }] }), true);
  assert.equal(templateHasContent({ line_items: [{ name: 'Car wash' }] }), true);
  assert.equal(templateHasContent({ extra: 'Due Friday' }), true);
});
