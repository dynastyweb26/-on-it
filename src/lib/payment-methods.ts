// Display labels for invoice_payments.method, shared by the invoice detail
// payment history and the Books income summary / Income PDF.
import { money } from '@/lib/financials';

export const METHOD_LABELS: Record<string, string> = {
  zelle: 'Zelle', cash: 'Cash', check: 'Check', card: 'Card', cashapp: 'Cash App', other: 'Other',
};

/** "Cash App", or "Cash App (via Stripe)" for a payment made on the pay page. */
export function paymentMethodLabel(method: string, viaStripe: boolean): string {
  const base = METHOD_LABELS[method] ?? method;
  return viaStripe ? `${base} (via Stripe)` : base;
}

// Ledger reversal rows (migration 20261005000000) — written only by the
// Connect webhook for refunds and disputes on Stripe card payments.
export const ENTRY_LABELS: Record<string, string> = {
  refund: 'Refund', dispute_withdrawn: 'Dispute', dispute_reinstated: 'Dispute won',
};

/** Payment history / income line label: "Refund", "Dispute", "Dispute won" for
 *  reversal rows, otherwise the method label. A row loaded without entry_type
 *  (an older query) that is negative is a reversal of unknown kind. */
export function ledgerEntryLabel(entryType: string | null | undefined, method: string, viaStripe: boolean, amount: number): string {
  if (entryType && ENTRY_LABELS[entryType]) return ENTRY_LABELS[entryType];
  if (!entryType && amount < 0) return 'Refund or dispute';
  return paymentMethodLabel(method, viaStripe);
}

/** An invoice's status as shown: a paid invoice with refunds reads "Refunded"
 *  (everything collected went back) or "Refunded $X" (part of it did).
 *  Refunds never change the status itself — the invoice stays paid. */
export function invoiceStatusLabel(status: string, refundedAmount: number | string | null | undefined, amountPaid: number | string | null | undefined): string {
  const refunded = Number(refundedAmount ?? 0);
  if (status !== 'paid' || !(refunded > 0)) return status;
  return refunded >= Number(amountPaid ?? 0) ? 'Refunded' : `Refunded ${money(refunded)}`;
}
