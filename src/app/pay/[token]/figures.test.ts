// Parity: the public pay page must show exactly the invoice's totals.
//
// The page renders the invoice's STORED figures (what calculateInvoiceTotals
// produced when the invoice was saved and what the PDF renders). These tests
// build those stored figures from line items, then assert every number/state
// the pay page derives matches the source of truth.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateInvoiceTotals,
  calculateSubtotal,
  money,
  type DepositType,
  type FinancialLineItem,
} from '@/lib/financials';
import { payFigures } from './figures';

const TAX_RATE = 8.875;

function parity(
  items: FinancialLineItem[],
  opts: {
    taxRate?: number;
    depositType?: DepositType;
    depositValue?: number;
    amountPaid?: number;
    kind?: 'invoice' | 'quote';
    status?: string | null;
  } = {},
) {
  const taxRate = opts.taxRate ?? 0;
  const totals = calculateInvoiceTotals(
    items,
    taxRate,
    opts.depositType ?? 'none',
    opts.depositValue ?? 0,
    opts.amountPaid ?? 0,
  );
  const pay = payFigures({
    kind: opts.kind ?? 'invoice',
    status: opts.status ?? 'sent',
    subtotal: totals.subtotal,
    taxRate,
    taxAmount: totals.taxAmount,
    total: totals.total,
    depositAmount: totals.depositAmount,
    amountPaid: opts.amountPaid ?? 0,
  });
  return { totals, pay };
}

// 24 line items with fractional quantities and cents, so both line-level and
// invoice-level rounding are exercised.
const TWENTY_FOUR: FinancialLineItem[] = Array.from({ length: 24 }, (_, i) => ({
  qty: (i % 3) + 1,
  unit_price: 12.34 + i * 1.07,
}));

test('8.875% tax on a 24-item invoice matches calculateInvoiceTotals', () => {
  const { totals, pay } = parity(TWENTY_FOUR, { taxRate: TAX_RATE });

  assert.equal(TWENTY_FOUR.length, 24);
  assert.equal(totals.subtotal, calculateSubtotal(TWENTY_FOUR));
  assert.equal(pay.subtotal, totals.subtotal);
  assert.equal(pay.taxAmount, totals.taxAmount);
  assert.equal(pay.total, totals.total);
  assert.equal(pay.dueNow, totals.dueNow);
  assert.equal(pay.primaryAmount, totals.dueNow);
  assert.equal(pay.primaryLabel, 'Total due');
  assert.equal(pay.paymentStage, 'unpaid');
  assert.equal(pay.showTaxBreakdown, true);
  assert.equal(pay.taxRate, TAX_RATE);
  // What the customer sees is exactly what the PDF renders.
  assert.equal(money(pay.total), money(totals.total));
});

test('percentage deposit paid: pay page shows the balance, not the deposit', () => {
  const depositValue = 30;
  // First find the deposit, then pay exactly it.
  const initial = calculateInvoiceTotals(TWENTY_FOUR, TAX_RATE, 'percentage', depositValue);
  const { totals, pay } = parity(TWENTY_FOUR, {
    taxRate: TAX_RATE,
    depositType: 'percentage',
    depositValue,
    amountPaid: initial.depositAmount,
  });

  assert.equal(pay.depositAmount, totals.depositAmount);
  assert.equal(pay.depositAmount, initial.depositAmount);
  assert.equal(pay.paid, initial.depositAmount);
  assert.equal(pay.fullyPaid, totals.paymentStage === 'paid');
  assert.equal(pay.depositPaid, true);
  assert.equal(pay.depositDue, false);
  assert.equal(pay.balanceAfterDeposit, totals.remaining);
  assert.equal(pay.dueNow, totals.dueNow);
  assert.equal(pay.primaryAmount, totals.dueNow);
  assert.equal(pay.primaryLabel, 'Balance due');
  assert.equal(pay.paymentStage, 'deposit_paid');
  assert.equal(money(pay.primaryAmount), money(totals.remaining));
});

test('fixed deposit partially paid: deposit due now matches the ledger rule', () => {
  const { totals, pay } = parity(TWENTY_FOUR, {
    taxRate: TAX_RATE,
    depositType: 'fixed',
    depositValue: 500,
    amountPaid: 200,
  });

  assert.equal(pay.depositAmount, totals.depositAmount);
  assert.equal(pay.depositAmount, 500);
  assert.equal(pay.depositDue, true);
  assert.equal(pay.depositPaid, false);
  assert.equal(pay.balanceAfterDeposit, totals.remaining);
  assert.equal(pay.dueNow, totals.dueNow);
  assert.equal(pay.primaryAmount, totals.dueNow);
  assert.equal(pay.primaryLabel, 'Deposit due now');
  assert.equal(pay.paymentStage, 'partial');
  assert.equal(money(pay.dueNow), money(300));
});

test('no tax rate: no Subtotal/Tax rows and the total is unchanged', () => {
  const { totals, pay } = parity(TWENTY_FOUR);
  assert.equal(totals.taxAmount, 0);
  assert.equal(pay.showTaxBreakdown, false);
  assert.equal(pay.total, totals.total);
  assert.equal(pay.primaryLabel, 'Total due');
});

test('an unpaid estimate says "Estimated total", never "quote"', () => {
  const { pay } = parity(TWENTY_FOUR, { kind: 'quote' });
  assert.equal(pay.primaryLabel, 'Estimated total');
  assert.doesNotMatch(pay.primaryLabel, /quote/i);
});
