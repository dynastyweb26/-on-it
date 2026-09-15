// ═══ ON IT — Financial Calculations Engine ═══
// Derived numeric values and arithmetic calculations MUST always be computed in code,
// never by the AI model orinline across separate components.

// 'percent' is the DB spelling; 'percentage' is the UI spelling. Both mean the same thing.
export type DepositType = 'percentage' | 'percent' | 'fixed' | 'none';

// Where the money stands relative to the deposit and the total.
export type PaymentStage = 'unpaid' | 'partial' | 'deposit_paid' | 'paid';

export interface FinancialLineItem {
  qty: number;
  unit_price: number;
}

export interface FinancialTotals {
  subtotal: number;
  taxAmount: number;
  total: number;
  depositAmount: number;
  remaining: number;
  amountDueNow: number;
  dueNow: number;
  balanceRemaining: number;
  credit: number;
  paymentStage: PaymentStage;
}

/** Formats a numeric amount as USD currency, returning '$—' for non-finite values. */
export function money(n: number): string {
  if (!Number.isFinite(n)) return '$—';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Round to 2 decimal places to prevent floating point drift. */
export function roundCurrency(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/** Compute the line item total: qty * unit_price */
export function calculateLineAmount(qty: number, unitPrice: number): number {
  const q = Number.isFinite(qty) ? qty : 0;
  const p = Number.isFinite(unitPrice) ? unitPrice : 0;
  return roundCurrency(q * p);
}

/** Compute total subtotal from array of line items */
export function calculateSubtotal(items: FinancialLineItem[]): number {
  if (!Array.isArray(items)) return 0;
  return roundCurrency(
    items.reduce((sum, item) => sum + calculateLineAmount(item.qty, item.unit_price), 0)
  );
}

/** Compute tax amount from subtotal and percentage tax rate */
export function calculateTaxAmount(subtotal: number, taxRate: number): number {
  const rate = Number.isFinite(taxRate) && taxRate > 0 ? taxRate : 0;
  return roundCurrency(subtotal * (rate / 100));
}

/**
 * Compute full totals: subtotal, tax, total, deposit, balance-after-deposit, plus
 * the payment-aware fields — dueNow (what to collect right now), credit (overpayment),
 * and paymentStage. This is the single source of truth: no caller re-derives any of it.
 *
 * @param amountPaid running total from the invoice_payments ledger (invoices.amount_paid)
 */
export function calculateInvoiceTotals(
  items: FinancialLineItem[],
  taxRate: number = 0,
  depositType: DepositType = 'none',
  depositValue: number = 0,
  amountPaid: number = 0
): FinancialTotals {
  const subtotal = calculateSubtotal(items);
  const taxAmount = calculateTaxAmount(subtotal, taxRate);
  const total = roundCurrency(subtotal + taxAmount);
  const paid = Number.isFinite(amountPaid) ? Math.max(0, amountPaid) : 0;

  // depositAmount: none/null → 0; percentage/percent → total × value/100; fixed → value.
  // Then clamp to [0, total] so a deposit never exceeds the bill or goes negative.
  let depositAmount = 0;
  const value = Number.isFinite(depositValue) ? depositValue : 0;
  if (depositType === 'percentage' || depositType === 'percent') {
    depositAmount = roundCurrency((total * value) / 100);
  } else if (depositType === 'fixed') {
    depositAmount = value;
  }
  depositAmount = roundCurrency(Math.min(Math.max(depositAmount, 0), Math.max(total, 0)));

  // balanceAfterDeposit — by subtraction, never by percentage, so pennies never drift.
  const remaining = roundCurrency(total - depositAmount);

  // Assertion: depositAmount + remaining must equal total
  if (roundCurrency(depositAmount + remaining) !== total) {
    console.warn(`Deposit math imbalance: deposit ${depositAmount} + remaining ${remaining} != total ${total}`);
  }

  // dueNow — what the customer owes right now.
  let dueNow: number;
  if (total <= 0) {
    dueNow = 0;
  } else if (paid >= total) {
    dueNow = 0;
  } else if (depositAmount > 0 && paid < depositAmount) {
    dueNow = roundCurrency(depositAmount - paid);
  } else {
    dueNow = roundCurrency(total - paid);
  }

  // balanceRemaining — the full amount still owed against the total (never
  // negative). Unlike dueNow, this is always total − paid, even when the deposit
  // is what's "due now": it's the figure "paid in full" and "request balance" mean.
  const balanceRemaining = roundCurrency(Math.max(0, total - paid));

  // credit — money received beyond the total. Never negative.
  const credit = roundCurrency(Math.max(0, paid - total));

  let paymentStage: PaymentStage;
  if (paid <= 0) {
    paymentStage = 'unpaid';
  } else if (paid >= total) {
    paymentStage = 'paid';
  } else if (depositAmount > 0 && paid >= depositAmount) {
    paymentStage = 'deposit_paid';
  } else {
    paymentStage = 'partial';
  }

  return {
    subtotal,
    taxAmount,
    total,
    depositAmount,
    remaining,
    amountDueNow: dueNow, // kept for back-compat; identical to dueNow
    dueNow,
    balanceRemaining,
    credit,
    paymentStage,
  };
}
