// Pure guards for the destructive round (Board 1 + the P-09/P-13/P-14 gaps).
// Money and document state only — no React, no DOM.
import { money } from '../financials';

/** Deleting a payment puts its amount back on the invoice, never below zero. */
export function balanceAfterDeletingPayment(balanceRemaining: number, paymentAmount: number): number {
  return Math.max(0, balanceRemaining + paymentAmount);
}

/** "INV-0007 goes back to $85.00 due." — the line P-09 never had. */
export function paymentDeleteConsequence(
  docNumber: string,
  balanceRemaining: number,
  paymentAmount: number,
): string {
  return `${docNumber} goes back to ${money(balanceAfterDeletingPayment(balanceRemaining, paymentAmount))} due.`;
}

/** Convert carries the figure in its button (board C4): the number cannot be
 *  previewed without a migration, so it names the amount instead. */
export function convertActionLabel(amountText: string): string {
  return `Convert to an invoice · ${amountText}`;
}

type Draftish = {
  client?: unknown;
  client_name?: string | null;
  items?: unknown[] | null;
  line_items?: unknown[] | null;
  extra?: string | null;
};

/** P-16: ask before discarding only when something was actually entered. */
export function templateHasContent(draft: Draftish | null | undefined): boolean {
  if (!draft) return false;
  const named = Boolean(draft.client) || Boolean(draft.client_name?.trim());
  const items = Array.isArray(draft.items) ? draft.items : Array.isArray(draft.line_items) ? draft.line_items : [];
  return named || items.length > 0 || Boolean(draft.extra?.trim());
}
