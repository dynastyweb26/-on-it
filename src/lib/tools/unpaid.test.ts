// Unpaid invoices: what counts as unpaid, what the cap means, and the money
// line the server speaks (the model never states an amount).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  UNPAID_ROW_CAP,
  balanceOf,
  isUnpaidInvoice,
  summarizeUnpaid,
  unpaidSentence,
  type UnpaidInvoiceRow,
} from './unpaid';

const row = (over: Partial<UnpaidInvoiceRow> = {}): UnpaidInvoiceRow => ({
  id: 'inv-1',
  invoice_number: 42,
  client_name: 'Maria',
  total: '500.00',
  amount_paid: '0',
  due_date: '2026-10-01',
  status: 'sent',
  ...over,
});

test('a full balance is unpaid; a fully paid invoice is not', () => {
  assert.equal(balanceOf(row()), 500);
  assert.equal(isUnpaidInvoice(row()), true);
  assert.equal(isUnpaidInvoice(row({ amount_paid: '500.00' })), false);
});

test('a partial payment leaves the rest owed and stays in the list', () => {
  const partial = row({ amount_paid: 200 });
  assert.equal(balanceOf(partial), 300);
  const summary = summarizeUnpaid([partial]);
  assert.equal(summary.totalCount, 1);
  assert.equal(summary.totalBalance, 300);
  assert.equal(summary.rows[0].balance, 300);
  assert.equal(summary.rows[0].balanceText, '$300.00');
});

test('a deposit already recorded counts toward amount_paid', () => {
  const withDeposit = row({ total: 1000, amount_paid: 400 });
  assert.equal(summarizeUnpaid([withDeposit]).totalBalance, 600);
});

test('drafts, voids and paid rows never appear', () => {
  const summary = summarizeUnpaid([
    row({ status: 'draft' }),
    row({ status: 'void' }),
    row({ status: 'paid', amount_paid: 500 }),
    row({ id: 'inv-2', status: 'overdue' }),
  ]);
  assert.equal(summary.totalCount, 1);
  assert.equal(summary.rows[0].id, 'inv-2');
});

test('the rows are capped at twenty while the totals count every open invoice', () => {
  const many = Array.from({ length: 30 }, (_, i) =>
    row({
      id: `inv-${i}`,
      invoice_number: i + 1,
      due_date: `2026-10-${String((i % 28) + 1).padStart(2, '0')}`,
    })
  );
  const summary = summarizeUnpaid(many);
  assert.equal(summary.rows.length, UNPAID_ROW_CAP);
  assert.equal(summary.totalCount, 30);
  assert.equal(summary.totalBalance, 15000);
  assert.equal(summary.totalBalanceText, '$15,000.00');
});

test('earliest due date first, an invoice with no due date last', () => {
  const summary = summarizeUnpaid([
    row({ id: 'none', due_date: null }),
    row({ id: 'late', due_date: '2026-09-01' }),
    row({ id: 'soon', due_date: '2026-10-15' }),
  ]);
  assert.deepEqual(summary.rows.map((r) => r.id), ['late', 'soon', 'none']);
});

test('minBalance filters the rows and the totals together', () => {
  const summary = summarizeUnpaid(
    [row({ id: 'a', total: 100 }), row({ id: 'b', total: 900 })],
    { minBalance: 500 }
  );
  assert.equal(summary.totalCount, 1);
  assert.equal(summary.rows[0].id, 'b');
  assert.equal(summary.totalBalance, 900);
});

test('the spoken line carries the money, says invoice, and has no emoji', () => {
  assert.equal(
    unpaidSentence(0, 0),
    'Nothing is outstanding: every invoice you have sent is paid.'
  );
  assert.equal(unpaidSentence(1, 42.5), '1 invoice is still open, $42.50 outstanding.');
  assert.equal(unpaidSentence(3, 1250), '3 invoices are still open, $1,250.00 outstanding.');
  for (const line of [unpaidSentence(0, 0), unpaidSentence(1, 1), unpaidSentence(9, 99999)]) {
    assert.equal(/\p{Extended_Pictographic}/u.test(line), false, 'no emoji');
    assert.equal(/quote/i.test(line), false, 'says invoice');
  }
});

test('an unnamed client and an unnumbered invoice still read cleanly', () => {
  const summary = summarizeUnpaid([row({ client_name: null, invoice_number: null })]);
  assert.equal(summary.rows[0].client, 'Unnamed client');
  assert.equal(summary.rows[0].number, 'Invoice');
});

test('the row number is the app document number', () => {
  const summary = summarizeUnpaid([row({ invoice_number: 7 })]);
  assert.match(summary.rows[0].number, /^INV-0*7$/);
});
