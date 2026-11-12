// The Books figures are pinned before and after the shared calculation lands.
// These literal numbers are what BooksView showed for this fixture with its
// original inline sums: ledger + counted other_income, minus non-deleted
// expenses, with sent/overdue remainders still owed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { booksTotals } from './books-totals';

const fixture = {
  // 1,200 + 250.50 − 20 refund = 1,430.50
  payments: [{ amount: '1200.00' }, { amount: '250.50' }, { amount: '-20.00' }],
  otherIncome: [
    { amount: '300.00', classification: 'other_income', deleted_at: null },
    { amount: '25.00', classification: 'customer_payment', deleted_at: null },
    { amount: '75.00', classification: 'transfer', deleted_at: null }, // recorded, not income
    { amount: '50.00', classification: 'customer_payment', deleted_at: '2026-11-02' },
  ],
  // 39.70 live, 50.00 deleted = 39.70
  expenses: [
    { amount: '39.70', deleted_at: null },
    { amount: '50.00', deleted_at: '2026-11-03' },
  ],
  // 400 + 150 owed; paid/draft/void/deleted/estimates never count.
  invoices: [
    { total: '500.00', amount_paid: '100.00', status: 'sent', kind: 'invoice', deleted_at: null },
    { total: '200.00', amount_paid: '50.00', status: 'overdue', kind: 'invoice', deleted_at: null },
    { total: '1000.00', amount_paid: '1000.00', status: 'paid', kind: 'invoice', deleted_at: null },
    { total: '300.00', amount_paid: '0', status: 'draft', kind: 'invoice', deleted_at: null },
    { total: '90.00', amount_paid: '0', status: 'sent', kind: 'invoice', deleted_at: '2026-11-01' },
    { total: '80.00', amount_paid: '0', status: 'sent', kind: 'quote', deleted_at: null },
  ],
};

test('the Books figures are exactly what the tab showed before the refactor', () => {
  assert.deepEqual(booksTotals(fixture), {
    collected: 1755.5,
    spent: 39.7,
    net: 1715.8,
    outstanding: 550,
  });
});

test('collected and net follow the ledger plus other income, not invoice face value', () => {
  const totals = booksTotals({
    payments: [{ amount: 100 }],
    otherIncome: [],
    expenses: [{ amount: 80 }],
    invoices: [{ total: 1000, amount_paid: 1000, status: 'paid' }],
  });
  assert.equal(totals.collected, 100);
  assert.equal(totals.net, 20);
  assert.equal(totals.outstanding, 0);
});

test('nothing to add up is zero, never a negative or a NaN', () => {
  assert.deepEqual(booksTotals({ payments: [], expenses: [], invoices: [] }), {
    collected: 0,
    spent: 0,
    net: 0,
    outstanding: 0,
  });
});
