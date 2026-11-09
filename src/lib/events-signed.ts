// ═══ The estimate_signed card (alive layer item 24) ═══
//
// A client signing an estimate is the owner's news, and it arrives from outside
// the owner's session, so it belongs in the feed. The signature itself is
// already written by public.sign_estimate, atomically with the notification
// claim; this module only records the card afterwards.
//
// Two rules make that safe:
//   * already_approved comes back as ok:false, so a repeat signature can never
//     plan a second card, and the bare dedupe key rejects a retried insert.
//   * a card failure must never fail a signature that already happened, so the
//     insert is wrapped and its error is logged, not thrown.
//
// The insert is injected instead of imported so this stays testable without the
// server-only Supabase client; the route passes the real `insertEvent`.
import { estimateSignedEvent } from '@/lib/events';
import type { EventInsert } from '@/lib/events-server';

/** The shape the sign route reads off public.sign_estimate. */
export interface SignResult {
  ok: boolean;
  code?: string;
  estimate_id?: string;
  user_id?: string;
  invoice_number?: number;
  client_name?: string | null;
  total?: number | string | null;
}

/**
 * Record the card for one successful signature.
 *
 * Returns the event id, or null when nothing was written: the RPC refused, the
 * signer IS the owner (their own session is not news), the row already exists,
 * or the write failed. Never throws.
 */
export async function recordEstimateSigned(
  result: SignResult,
  sessionUserId: string | null,
  insert: (row: EventInsert) => Promise<string | null>,
  log: (message: string, error?: unknown) => void = (message, error) => console.error(message, error),
): Promise<string | null> {
  if (!result.ok) return null; // already_approved / content_changed / expired
  if (!result.estimate_id || !result.user_id) return null;
  if (typeof result.invoice_number !== 'number') return null;
  // The owner opening their own link is not the client signing.
  if (sessionUserId && sessionUserId === result.user_id) return null;

  const e = estimateSignedEvent({
    estimate_id: result.estimate_id,
    user_id: result.user_id,
    invoice_number: result.invoice_number,
    client_name: result.client_name ?? null,
    total: result.total ?? null,
  });

  try {
    return await insert({
      userId: result.user_id,
      kind: e.kind,
      actor: 'client',
      invoiceId: e.invoiceId,
      documentKind: e.documentKind,
      documentNumber: e.documentNumber,
      clientName: e.clientName,
      amount: e.amount,
      meta: e.meta,
      dedupeKey: e.dedupeKey,
    });
  } catch (error) {
    log('[events] estimate_signed write failed', error);
    return null;
  }
}
