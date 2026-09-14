// ═══ ON IT — Financial Calculations Engine ═══
// Derived numeric values and arithmetic calculations MUST always be computed in code,
// never by the AI model or inline across separate components.

export type DepositType = 'percentage' | 'percent' | 'fixed' | 'none';
export type PaymentStage = 'unpaid' | 'deposit_paid' | 'partial' | 'paid';

export interface FinancialLineItem {
  qty: number;
  unit_price: number;
}

export interface FinancialTotals {
  subtotal: number;
  taxAmount: number;
  total: number;
  depositAmount: number;
  balanceAfterDeposit: number;
  dueNow: number;
  credit: number;
  paymentStage: PaymentStage;
  amountDueNow: number; // alias of dueNow
  remaining: number; // alias of balanceAfterDeposit
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

/** Round half away from zero at two decimal places. */
export function round2(num: number): number {
  if (!Number.isFinite(num)) return 0;
  const sign = num < 0 ? -1 : 1;
  const abs = Math.abs(num);
  return sign * (Math.round(abs * 100 + Number.EPSILON) / 100);
}

/** Compute the line item total: qty * unit_price */
export function calculateLineAmount(qty: number, unitPrice: number): number {
  const q = Number.isFinite(qty) ? qty : 0;
  const p = Number.isFinite(unitPrice) ? unitPrice : 0;
  return round2(q * p);
}

/** Compute total subtotal from array of line items */
export function calculateSubtotal(items: FinancialLineItem[]): number {
  if (!Array.isArray(items)) return 0;
  return round2(
    items.reduce((sum, item) => sum + calculateLineAmount(item.qty, item.unit_price), 0)
  );
}

/** Compute tax amount from subtotal and percentage tax rate */
export function calculateTaxAmount(subtotal: number, taxRate: number): number {
  const rate = Number.isFinite(taxRate) && taxRate > 0 ? taxRate : 0;
  return round2(subtotal * (rate / 100));
}

/** Single source of truth for invoice financial derivations. */
export function calculateInvoiceTotals(
  items: FinancialLineItem[],
  taxRate: number = 0,
  depositType: DepositType | string | null = 'none',
  depositValue: number = 0,
  amountPaid: number = 0
): FinancialTotals {
  const subtotal = calculateSubtotal(items);
  const taxAmount = calculateTaxAmount(subtotal, taxRate);
  const total = round2(subtotal + taxAmount);
  const paid = Number.isFinite(amountPaid) ? Math.max(0, amountPaid) : 0;
  const val = Number.isFinite(depositValue) ? depositValue : 0;

  // Collapse dual 'percent' / 'percentage' spelling to 'percentage', keeping 'percent' accepted on read.
  const normalizedDepositType =
    depositType === 'percent' || depositType === 'percentage'
      ? 'percentage'
      : depositType === 'fixed'
      ? 'fixed'
      : 'none';

  let rawDeposit = 0;
  if (normalizedDepositType === 'percentage' && val > 0) {
    rawDeposit = round2((total * val) / 100);
  } else if (normalizedDepositType === 'fixed' && val > 0) {
    rawDeposit = round2(val);
  }

  const depositAmount = Math.max(0, Math.min(rawDeposit, total));
  const balanceAfterDeposit = round2(total - depositAmount);

  let dueNow = 0;
  if (total <= 0) {
    dueNow = 0;
  } else if (paid >= total) {
    dueNow = 0;
  } else if (depositAmount > 0 && paid < depositAmount) {
    dueNow = round2(depositAmount - paid);
  } else {
    dueNow = round2(total - paid);
  }

  const credit = Math.max(0, round2(paid - total));

  let paymentStage: PaymentStage = 'unpaid';
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
    balanceAfterDeposit,
    dueNow,
    credit,
    paymentStage,
    amountDueNow: dueNow,
    remaining: balanceAfterDeposit,
  };
}
