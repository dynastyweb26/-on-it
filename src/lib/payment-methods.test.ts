import test from 'node:test';
import assert from 'node:assert/strict';
import {
  METHOD_LABELS, invoiceStatusLabel, ledgerEntryLabel, paymentMethodLabel,
} from '@/lib/payment-methods';

test('legacy cash and check rows still display their own labels', () => {
  assert.equal(METHOD_LABELS.cash, 'Cash');
  assert.equal(METHOD_LABELS.check, 'Check');
  assert.equal(paymentMethodLabel('cash', false), 'Cash');
  assert.equal(paymentMethodLabel('check', false), 'Check');
});

test('legacy cashapp and bank rows still display their own labels', () => {
  assert.equal(paymentMethodLabel('cashapp', false), 'Cash App');
  assert.equal(paymentMethodLabel('bank', false), 'Bank transfer');
});

test('all selectable method values display the Payouts label', () => {
  assert.equal(paymentMethodLabel('card', false), 'Card');
  assert.equal(paymentMethodLabel('bank', false), 'Bank transfer');
  assert.equal(paymentMethodLabel('zelle', false), 'Zelle');
  assert.equal(paymentMethodLabel('cashapp', false), 'Cash App');
  assert.equal(paymentMethodLabel('paypal', false), 'PayPal');
  assert.equal(paymentMethodLabel('venmo', false), 'Venmo');
  assert.equal(paymentMethodLabel('other', false), 'Other');
});

test('a Stripe payment keeps the via-Stripe suffix', () => {
  assert.equal(paymentMethodLabel('card', true), 'Card (via Stripe)');
  assert.equal(paymentMethodLabel('cashapp', true), 'Cash App (via Stripe)');
  assert.equal(paymentMethodLabel('other', true), 'Other (via Stripe)');
  assert.equal(paymentMethodLabel('paypal', true), 'PayPal (via Stripe)');
});

test('reversal rows label the entry type, not the method', () => {
  assert.equal(ledgerEntryLabel('refund', 'card', true, -20), 'Refund');
  assert.equal(ledgerEntryLabel('dispute_withdrawn', 'card', true, -20), 'Dispute');
  assert.equal(ledgerEntryLabel('dispute_reinstated', 'card', true, 20), 'Dispute won');
  assert.equal(ledgerEntryLabel(null, 'cash', false, -20), 'Refund or dispute');
  assert.equal(ledgerEntryLabel(null, 'check', false, 20), 'Check');
});

test('invoice status stays paid except when a refund is shown', () => {
  assert.equal(invoiceStatusLabel('sent', 0, 0), 'sent');
  assert.equal(invoiceStatusLabel('paid', 0, 50), 'paid');
  assert.equal(invoiceStatusLabel('paid', 20, 50), 'Refunded $20.00');
  assert.equal(invoiceStatusLabel('paid', 50, 50), 'Refunded');
});
