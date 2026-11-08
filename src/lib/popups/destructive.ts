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

// ── Board 1 · D1/D2/D3: the delete confirms ──
// The board is the spec, so its labels and its "what did not happen"
// sentences live here: a unit test pins them instead of a screenshot.

/** The go label carries the figure: "Delete invoice · $200.00" (D1/D2). */
export function deleteActionLabel(noun: string, figure: string): string {
  return `Delete ${noun.toLowerCase()} · ${figure}`;
}

/** D1: only a record that already left the phone needs the typed word. A
 *  draft deletes like an expense — no field. */
export function deleteNeedsTyped(status: string | null | undefined): boolean {
  return status === 'sent' || status === 'paid' || status === 'overdue';
}

/** D1 — what did not happen, in the document's own words. */
export function invoiceDeleteConsequence(docNumber: string): string {
  return `Nothing was deleted. ${docNumber} is still in your list.`;
}

/** D2 — the cause sentence is appended by popupFailure(). */
export const EXPENSE_DELETE_CONSEQUENCE = 'Nothing was deleted.';

/** D3 — the documents survive, so the client's name says what still exists. */
export function clientDeleteConsequence(name: string): string {
  return `Nothing was deleted. ${name} is still in your clients.`;
}

/** D3's figure card: the documents that stay, never a dollar amount. */
export function clientDocCountLabel(invoices: number, estimates: number): string {
  const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  return `${count(invoices, 'invoice')} · ${count(estimates, 'estimate')} stay`;
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

// ── Board 1 · D8: removing a saved attachment ──
/** D8's title, worded for what is actually on the tile. */
export function attachmentRemoveTitle(isImage: boolean): string {
  return isImage ? 'Remove this photo?' : 'Remove this file?';
}

/** D8's go label: the frame's photo variant, and the file variant for a PDF. */
export function attachmentRemoveLabel(isImage: boolean): string {
  return isImage ? 'Remove photo' : 'Remove file';
}

/** D8 — what did NOT happen; the cause sentence is appended by popupFailure(). */
export const ATTACHMENT_REMOVE_CONSEQUENCE = 'Couldn’t remove that file.';
