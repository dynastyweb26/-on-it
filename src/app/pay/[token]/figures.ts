// ═══ Public pay page — figures ═══
//
// One pure place for every number and state label the pay page shows. The page
// reads the invoice's AUTHORITATIVE stored figures (total with tax baked in,
// deposit_amount, ledger-synced amount_paid) — it never recomputes tax or the
// total from line items. dueNowFromLedger is shared with the card checkout
// route, so what the page shows is exactly what it charges.
//
// figures.test.ts checks these outputs against calculateInvoiceTotals for the
// same line items, so the pay page cannot drift from the invoice/PDF totals.

import { dueNowFromLedger, roundCurrency, type PaymentStage } from '@/lib/financials';

export interface PayFigureInput {
  kind: 'invoice' | 'quote';
  status: string | null;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  depositAmount: number;
  amountPaid: number;
}

export interface PayFigures {
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  paid: number;
  depositAmount: number;
  balanceAfterDeposit: number;
  dueNow: number;
  balanceRemaining: number;
  fullyPaid: boolean;
  voided: boolean;
  paymentStage: PaymentStage;
  primaryLabel: string;
  primaryAmount: number;
  showTotalSubline: boolean;
  showTaxBreakdown: boolean;
  depositDue: boolean;
  depositPaid: boolean;
}

export function payFigures(input: PayFigureInput): PayFigures {
  const { kind, status, subtotal, taxRate, taxAmount, total } = input;
  const { paid, depositAmount, dueNow, fullyPaid } = dueNowFromLedger(
    total,
    input.depositAmount,
    input.amountPaid,
  );
  const voided = status === 'void';

  let primaryLabel: string;
  let primaryAmount: number;
  if (voided) {
    primaryLabel = 'Cancelled';
    primaryAmount = total;
  } else if (fullyPaid) {
    primaryLabel = 'Paid in full';
    primaryAmount = total;
  } else if (depositAmount > 0 && paid < depositAmount) {
    primaryLabel = 'Deposit due now';
    primaryAmount = dueNow;
  } else if (paid > 0) {
    primaryLabel = 'Balance due';
    primaryAmount = dueNow;
  } else {
    primaryLabel = kind === 'quote' ? 'Quoted total' : 'Total due';
    primaryAmount = dueNow;
  }

  const paymentStage: PaymentStage =
    paid <= 0
      ? 'unpaid'
      : fullyPaid
        ? 'paid'
        : depositAmount > 0 && paid >= depositAmount
          ? 'deposit_paid'
          : 'partial';

  return {
    subtotal,
    taxRate,
    taxAmount,
    total,
    paid,
    depositAmount,
    balanceAfterDeposit: roundCurrency(Math.max(0, total - depositAmount)),
    dueNow,
    balanceRemaining: roundCurrency(Math.max(0, total - paid)),
    fullyPaid,
    voided,
    paymentStage,
    primaryLabel,
    primaryAmount,
    showTotalSubline: roundCurrency(primaryAmount) !== roundCurrency(total),
    showTaxBreakdown: taxRate > 0,
    depositDue: !voided && !fullyPaid && depositAmount > 0 && paid < depositAmount,
    depositPaid: !voided && !fullyPaid && depositAmount > 0 && paid >= depositAmount,
  };
}
