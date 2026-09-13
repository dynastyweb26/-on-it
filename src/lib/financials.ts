// ═══ ON IT — Financial Calculations Engine ═══
// Derived numeric values and arithmetic calculations MUST always be computed in code,
// never by the AI model orinline across separate components.

export type DepositType = 'percentage' | 'fixed' | 'none';

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

/** Compute full totals including subtotal, tax, total, deposit, remaining balance, and amount due now */
export function calculateInvoiceTotals(
  items: FinancialLineItem[],
  taxRate: number = 0,
  depositType: DepositType = 'none',
  depositValue: number = 0,
  paymentsReceived: number = 0
): FinancialTotals {
  const subtotal = calculateSubtotal(items);
  const taxAmount = calculateTaxAmount(subtotal, taxRate);
  const total = roundCurrency(subtotal + taxAmount);

  let depositAmount = 0;
  if (depositType === 'percentage' && Number.isFinite(depositValue) && depositValue > 0) {
    depositAmount = roundCurrency((total * depositValue) / 100);
  } else if (depositType === 'fixed' && Number.isFinite(depositValue) && depositValue > 0) {
    depositAmount = roundCurrency(Math.min(depositValue, total));
  }

  const remaining = roundCurrency(total - depositAmount);

  // Assertion: depositAmount + remaining must equal total
  if (roundCurrency(depositAmount + remaining) !== total) {
    console.warn(`Deposit math imbalance: deposit ${depositAmount} + remaining ${remaining} != total ${total}`);
  }

  let amountDueNow = total;
  if (Number.isFinite(paymentsReceived) && paymentsReceived > 0) {
    amountDueNow = Math.max(0, roundCurrency(total - paymentsReceived));
  } else if (depositType !== 'none' && depositAmount > 0) {
    amountDueNow = depositAmount;
  }

  return {
    subtotal,
    taxAmount,
    total,
    depositAmount,
    remaining,
    amountDueNow,
  };
}
