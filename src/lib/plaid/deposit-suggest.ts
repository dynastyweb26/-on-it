// ═══ Deposit → invoice suggestions (exact signals only) ═══
// Two signals, nothing else:
//   (a) the invoice's own number appears in the deposit's name / merchant, as
//       "INV-0042", "INV 42", "INV42" or "#42";
//   (b) the deposit's amount equals the open balance of exactly ONE invoice.
// A number that names two invoices, a number and an amount that point at
// different invoices, or an amount shared by two invoices all yield NO
// suggestion. Never fuzzy, and never applied by itself.
import { formatDocNumber } from '../documents';
import { parseCents } from './match';

/** The invoice columns a suggestion reads. Money arrives as numeric strings. */
export type SuggestInvoice = {
  id: string;
  invoice_number: number | null;
  total: string | number;
  amount_paid: string | number | null;
};

export type DepositSuggestion = {
  invoice_id: string;
  reason: 'invoice_number' | 'amount';
};

/** Integer cents still owed, or null when the row cannot be parsed. */
export function openBalanceCents(invoice: SuggestInvoice): number | null {
  const total = parseCents(invoice.total);
  const paid = parseCents(invoice.amount_paid ?? 0);
  if (total === null || paid === null) return null;
  return total - paid;
}

/**
 * "INV-0042" / "INV 42" / "INV42" / "#42" as a whole token. A bare number is
 * deliberately NOT a signal: it would match amounts and dates.
 */
function numberPattern(invoiceNumber: number): RegExp {
  const n = Math.trunc(invoiceNumber);
  return new RegExp(`(?:\\bINV[\\s-]?0*${n}\\b|#0*${n}\\b)`, 'i');
}

export function suggestDepositInvoice(
  deposit: {
    name: string | null | undefined;
    merchant_name: string | null | undefined;
    amount_cents: number;
  },
  invoices: SuggestInvoice[],
): DepositSuggestion | null {
  if (!Number.isSafeInteger(deposit.amount_cents) || deposit.amount_cents <= 0) return null;

  const haystack = `${deposit.name ?? ''} ${deposit.merchant_name ?? ''}`;
  const byNumber = invoices.filter((invoice) => {
    const number = invoice.invoice_number;
    if (!Number.isInteger(number) || (number ?? 0) <= 0) return false;
    return numberPattern(number as number).test(haystack);
  });
  const byAmount = invoices.filter(
    (invoice) => openBalanceCents(invoice) === deposit.amount_cents,
  );

  // Two invoices named in one memo is ambiguous, whatever the amount says.
  if (byNumber.length > 1) return null;

  if (byNumber.length === 1) {
    const only = byNumber[0];
    // Both signals present and pointing elsewhere: no suggestion.
    if (byAmount.length > 0 && !byAmount.some((invoice) => invoice.id === only.id)) return null;
    return { invoice_id: only.id, reason: 'invoice_number' };
  }

  // No number: only an amount that exactly one open invoice matches.
  if (byAmount.length === 1) return { invoice_id: byAmount[0].id, reason: 'amount' };
  return null;
}

/** "INV-0042" for the card's match line. */
export function invoiceLabel(invoiceNumber: number | null): string {
  return Number.isInteger(invoiceNumber) && (invoiceNumber ?? 0) > 0
    ? formatDocNumber('invoice', invoiceNumber as number)
    : 'Invoice';
}
