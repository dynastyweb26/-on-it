// Deposit → invoice suggestions: exact signals only, ambiguity gives nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invoiceLabel, openBalanceCents, suggestDepositInvoice, type SuggestInvoice } from './deposit-suggest';

const inv = (
  id: string,
  invoice_number: number,
  total: string,
  amount_paid = '0.00',
): SuggestInvoice => ({ id, invoice_number, total, amount_paid });

const deposit = (name: string, cents: number, merchant: string | null = null) => ({
  name, merchant_name: merchant, amount_cents: cents,
});

test('an invoice number in the memo is an exact signal', () => {
  const invoices = [inv('a', 42, '450.00'), inv('b', 43, '900.00')];
  assert.deepEqual(
    suggestDepositInvoice(deposit('ZELLE FROM MIKE INV-0042', 45000), invoices),
    { invoice_id: 'a', reason: 'invoice_number' },
  );
  assert.deepEqual(
    suggestDepositInvoice(deposit('deposit for #43', 90000), invoices),
    { invoice_id: 'b', reason: 'invoice_number' },
  );
});

test('an amount that equals exactly one open balance is a signal', () => {
  const invoices = [inv('a', 42, '1000.00', '550.00'), inv('b', 43, '900.00')];
  assert.deepEqual(
    suggestDepositInvoice(deposit('CHECK DEPOSIT', 45000), invoices),
    { invoice_id: 'a', reason: 'amount' },
  );
});

test('two invoices sharing the amount is ambiguous: no suggestion', () => {
  const invoices = [inv('a', 42, '450.00'), inv('b', 43, '450.00')];
  assert.equal(suggestDepositInvoice(deposit('CHECK DEPOSIT', 45000), invoices), null);
});

test('a number and an amount pointing at different invoices gives nothing', () => {
  const invoices = [inv('a', 42, '1000.00'), inv('b', 43, '450.00')];
  assert.equal(suggestDepositInvoice(deposit('INV-0042', 45000), invoices), null);
});

test('two invoice numbers in one memo is ambiguous, whatever the amount says', () => {
  const invoices = [inv('a', 42, '450.00'), inv('b', 43, '450.00')];
  assert.equal(suggestDepositInvoice(deposit('INV-0042 / INV-0043', 45000), invoices), null);
});

test('fuzzy evidence is not a signal: no vendor, no bare number, no date', () => {
  const invoices = [inv('a', 42, '450.00')];
  // Amounts deliberately differ from the open balance: only text is under test.
  assert.equal(suggestDepositInvoice(deposit('Mike Davis payment', 12345, 'Mike Davis'), invoices), null);
  assert.equal(suggestDepositInvoice(deposit('DEPOSIT 42', 12345), invoices), null);
  assert.equal(suggestDepositInvoice(deposit('DEPOSIT 2026-10-28', 12345), invoices), null);
  assert.equal(suggestDepositInvoice(deposit('ZELLE', 1), invoices), null);
});

test('a fully paid invoice is never suggested by amount', () => {
  const invoices = [inv('a', 42, '450.00', '450.00')];
  assert.equal(suggestDepositInvoice(deposit('CHECK DEPOSIT', 45000), invoices), null);
});

test('open balance is exact cents and refuses malformed money', () => {
  assert.equal(openBalanceCents(inv('a', 1, '1000.00', '550.00')), 45000);
  assert.equal(openBalanceCents({ id: 'b', invoice_number: 2, total: 'nope', amount_paid: 0 }), null);
});

test('the match line formats the document number the app uses', () => {
  assert.equal(invoiceLabel(42), 'INV-0042');
  assert.equal(invoiceLabel(null), 'Invoice');
});
