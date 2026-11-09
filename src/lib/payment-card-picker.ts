// The "Record a payment" button's card: which clients the dropdown offers, how a
// typed name links to a saved client, and which invoice the payment lands on.
// Pure decisions only (CLAUDE.md interaction rule 6): no React, no network. The
// card shows what these return; it never decides anything itself.
import type { ClientSummary } from '@/lib/clients';
import type { OpenInvoice } from '@/lib/payment-intent';
import { classifyError } from '@/lib/errors';

/** The dropdown shows the most recent 5-8 clients; we offer the top 8. */
export const PAYMENT_CLIENT_LIMIT = 8;

/** The dropdown's last option, which turns the field into a text input. */
export const OTHER_CLIENT_LABEL = 'Other…';

const nameKey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

function ms(iso: string | null): number {
  if (!iso) return Number.NEGATIVE_INFINITY;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

/**
 * The clients the dropdown offers: people I've invoiced or saved, most recent
 * activity first, no duplicate names, capped. client_summaries() already leaves
 * out deleted clients; blank names are dropped here. A saved client with no
 * activity yet sorts after everyone with activity, A to Z.
 */
export function recentPaymentClients(rows: ClientSummary[], limit: number = PAYMENT_CLIENT_LIMIT): ClientSummary[] {
  const usable = rows.filter((c) => c.name.trim() !== '' && (c.saved || c.doc_count > 0));
  const sorted = [...usable].sort((a, b) => {
    const diff = ms(b.last_used_at) - ms(a.last_used_at);
    if (diff !== 0 && !Number.isNaN(diff)) return diff;
    return a.name.localeCompare(b.name);
  });
  const seen = new Set<string>();
  const out: ClientSummary[] = [];
  for (const c of sorted) {
    const k = nameKey(c.name);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
    if (out.length >= Math.max(0, limit)) break;
  }
  return out;
}

/**
 * A name typed under "Other…": the saved client it spells (case and spacing
 * ignored), or null. Matches against every client, not only the dropdown's few.
 * Exact only: a fuzzy link could put money on the wrong person.
 */
export function matchTypedClient(typed: string, rows: ClientSummary[]): ClientSummary | null {
  const k = nameKey(typed);
  if (!k) return null;
  return rows.find((c) => nameKey(c.name) === k) ?? null;
}

export type InvoiceChoice =
  | { kind: 'none' }
  | { kind: 'one'; invoice: OpenInvoice }
  | { kind: 'many'; invoices: OpenInvoice[] };

/**
 * Which invoice a payment goes to. Only unpaid invoices of that client count
 * (estimates never take a payment). Exactly one: use it. Several: the owner
 * picks, oldest first, nothing preselected. None: say so and stop.
 */
export function chooseInvoiceForClient(clientName: string, invoices: OpenInvoice[]): InvoiceChoice {
  const k = nameKey(clientName);
  if (!k) return { kind: 'none' };
  const open = invoices
    .filter((i) => i.kind === 'invoice' && i.amountPaid < i.total && nameKey(i.clientName) === k)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  if (open.length === 0) return { kind: 'none' };
  if (open.length === 1) return { kind: 'one', invoice: open[0] };
  return { kind: 'many', invoices: open };
}

/** Shown when the chosen client has no unpaid invoice. Confirm stays blocked. */
export function noUnpaidInvoicesMessage(clientName: string): string {
  const name = clientName.trim();
  return `${name || 'This client'} has no unpaid invoices to apply this to.`;
}

export type PaymentCardLoad =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string };

/**
 * The real cause of a failed client or invoice load, in words. Signed out and
 * offline are named; everything else is ours. `signedIn` is checked first so a
 * missing user never reads as a server fault.
 */
export function paymentCardLoadError(error: unknown, signedIn: boolean): string {
  if (!signedIn) return 'Sign in to record a payment.';
  const kind = classifyError(error);
  if (kind === 'signed_out') return 'Sign in to record a payment.';
  if (kind === 'offline') return "You're offline. Reconnect to pick a client.";
  return "I couldn't load your clients. Try again.";
}

/**
 * Where a "Record a payment" tap lands. One open card at a time: if one is
 * already in the chat (or being added this frame), a repeat tap scrolls to it
 * instead of adding another.
 */
export function openPaymentCardTarget(
  messages: ReadonlyArray<{ id: string; payProposal?: unknown }>,
  pendingId: string | null,
): { action: 'add' } | { action: 'scroll'; id: string } | { action: 'ignore' } {
  const open = messages.find((m) => m.payProposal != null);
  if (open) return { action: 'scroll', id: open.id };
  // Added this frame but not committed to state yet: swallow the tap.
  if (pendingId) return { action: 'ignore' };
  return { action: 'add' };
}
