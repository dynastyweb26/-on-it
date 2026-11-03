// ═══ "An existing payment": the owner picks, and says so ═══
// Before this, the card preselected a path and hid the candidates in a native
// select. Now nothing is chosen unless the bank suggested an invoice, the
// candidates are the rows from the mockup, and an empty list disables the path
// instead of offering an empty picker.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DepositCard from './DepositCard';
import { formatDay } from '../../lib/bank-tracking';
import PaymentPicker from './PaymentPicker';
import type { ApiDeposit, DepositPayment } from '../../lib/bank-deposits';

const base: ApiDeposit = {
  id: 'd1',
  name: 'ACME PROPERTIES',
  merchant: 'Acme Properties',
  amount_cents: 40000,
  occurred_on: '2026-10-29',
  pending: false,
  removed: false,
  is_stripe_payout: false,
  payout: 'not_stripe',
  accounted: false,
  link: null,
  suggestion: null,
};

const PAYMENT: DepositPayment = {
  id: 'p1',
  invoice_number: 42,
  client_name: 'Nakamura Property Group',
  amount_cents: 40000,
  method: 'check',
  paid_at: '2026-10-29',
};

const card = (deposit: ApiDeposit, payments: DepositPayment[]) =>
  renderToStaticMarkup(createElement(DepositCard, {
    deposit,
    invoices: [],
    payments,
    onResolved: () => {},
  }));

const radios = (html: string) => html.match(/role="radio" aria-checked="true"/g) ?? [];

const picker = (payments: DepositPayment[]) => renderToStaticMarkup(createElement(PaymentPicker, {
  candidates: payments, selected: '', onPick: () => {},
}));

test('zero candidates disables the path and preselects nothing', () => {
  const html = card(base, []);
  assert.equal(radios(html).length, 0, 'no path is chosen for the owner');
  assert.equal(html.includes('No unlinked payments yet.'), true, 'the path says why it cannot be used');
  assert.equal(html.includes('Choose A new payment for an invoice instead.'), true, 'and what to choose instead');
  const at = html.indexOf('An existing payment');
  const existing = html.slice(html.lastIndexOf('<button', at), at);
  assert.equal(existing.includes('disabled'), true, 'the empty path is not selectable');
  assert.equal(html.includes('Which payment is this deposit for?'), false, 'no list means no picker');
});

test('a suggestion opens on the invoice it points at', () => {
  const html = card({
    ...base,
    suggestion: { invoice_id: 'inv-1', invoice_number: 42, reason: 'amount' },
  }, []);
  assert.equal(radios(html).length, 1, 'exactly the suggested path is chosen');
  const invoice = html.slice(html.indexOf('A new payment for an invoice'), html.indexOf('Other money received'));
  assert.equal(invoice.includes('aria-checked="true"'), true);
});

test('a candidate reads as Client · $amount, then INV-#### · logged <day>', () => {
  const html = picker([PAYMENT]);
  assert.equal(html.includes('Nakamura Property Group · $400.00'), true, 'the row leads with the client');
  assert.equal(html.includes(`INV-0042 · logged ${formatDay(PAYMENT.paid_at)}`), true, 'and says which payment it is');
  assert.equal(html.includes('Which payment is this deposit for?'), true, 'the label asks the question');
  assert.equal(html.includes('so the money isn’t counted twice'), true, 'the helper says why');
  assert.equal(radios(html).length, 0, 'a candidate list alone still preselects nothing');
});
