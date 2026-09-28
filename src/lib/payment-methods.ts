// Display labels for invoice_payments.method, shared by the invoice detail
// payment history and the Books income summary / Income PDF.
export const METHOD_LABELS: Record<string, string> = {
  zelle: 'Zelle', cash: 'Cash', check: 'Check', card: 'Card', cashapp: 'Cash App', other: 'Other',
};

/** "Cash App", or "Cash App (via Stripe)" for a payment made on the pay page. */
export function paymentMethodLabel(method: string, viaStripe: boolean): string {
  const base = METHOD_LABELS[method] ?? method;
  return viaStripe ? `${base} (via Stripe)` : base;
}
