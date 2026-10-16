// BANK-TRANSFER-SPEC.md commit 5 · 3: no bank fields for paid or void
// invoices, or when disabled. The SQL side (get_public_invoice_bank returns
// zero rows) is asserted by privcheck Y5; this covers the app-side gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicBank, type PublicBankRow } from './pay-bank';

const row: PublicBankRow = {
  holder_name: 'TEST Holder', bank_name: 'TEST Bank', routing: '021000021',
  account: '123456784417', account_type: 'checking',
};
const open = { kind: 'invoice' as const, status: 'sent', fullyPaid: false };

test('sent or overdue, unpaid invoice: bank details pass through', () => {
  assert.deepEqual(publicBank(row, open), {
    holderName: 'TEST Holder', bankName: 'TEST Bank', routing: '021000021',
    account: '123456784417', accountType: 'checking',
  });
  assert.ok(publicBank(row, { ...open, status: 'overdue' }));
});

test('paid invoice: no bank fields', () => {
  assert.equal(publicBank(row, { ...open, status: 'paid', fullyPaid: true }), null);
  assert.equal(publicBank(row, { ...open, fullyPaid: true }), null); // ledger says paid, status lagging
});

test('void invoice: no bank fields', () => {
  assert.equal(publicBank(row, { ...open, status: 'void' }), null);
});

test('draft or quote: no bank fields', () => {
  assert.equal(publicBank(row, { ...open, status: 'draft' }), null);
  assert.equal(publicBank(row, { ...open, kind: 'quote' }), null);
});

test('disabled (RPC returned no row): no bank fields', () => {
  assert.equal(publicBank(null, open), null);
  assert.equal(publicBank(undefined, open), null);
});

test('any missing or unknown field: no bank fields', () => {
  for (const k of ['holder_name', 'bank_name', 'routing', 'account'] as const) {
    assert.equal(publicBank({ ...row, [k]: '  ' }, open), null, k);
  }
  assert.equal(publicBank({ ...row, account_type: 'brokerage' }, open), null);
});
