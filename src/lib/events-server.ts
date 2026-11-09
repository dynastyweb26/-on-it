// ═══ Server-side event writes (alive layer item 7) ═══
// Route handlers only. RLS lets an owner read their events and update three
// columns on them; creation lives here, behind the service role, so no browser
// can post a card into its own thread.
//
// Duplicate suppression: events_user_dedupe_uidx is a PARTIAL unique index, so
// PostgREST cannot express ON CONFLICT against it. A repeat therefore arrives
// as 23505 and is read as "already posted" — the same forgiveness the payment
// ledger uses. Callers must not notify when the insert returns null.
import 'server-only';
import { createHash } from 'node:crypto';
import { adminClient } from '@/lib/supabase/admin';

export interface EventInsert {
  userId: string;
  kind: string;
  actor: 'client' | 'time';
  invoiceId?: string | null;
  documentKind?: 'invoice' | 'quote' | null;
  documentNumber?: number | null;
  clientName?: string | null;
  amount?: number | null;
  meta?: Record<string, unknown>;
  dedupeKey?: string | null;
  occurredAt?: string;
}

/** A salted hash of the request's address + agent. Never the raw address. */
export function viewerHash(ip: string, userAgent: string): string {
  const salt = process.env.EVENTS_HASH_SALT ?? 'onit-document-view';
  return createHash('sha256').update(`${salt}|${ip}|${userAgent}`).digest('hex').slice(0, 40);
}

/** Insert one event. Returns its id, or null when this occurrence already has a
 *  row (the dedupe index rejected it) — never an error for a duplicate. */
export async function insertEvent(row: EventInsert): Promise<string | null> {
  const { data, error } = await adminClient()
    .from('events')
    .insert({
      user_id: row.userId,
      kind: row.kind,
      actor: row.actor,
      invoice_id: row.invoiceId ?? null,
      document_kind: row.documentKind ?? null,
      document_number: row.documentNumber ?? null,
      client_name: row.clientName ?? null,
      amount: row.amount ?? null,
      meta: row.meta ?? {},
      dedupe_key: row.dedupeKey ?? null,
      ...(row.occurredAt ? { occurred_at: row.occurredAt } : {}),
    })
    .select('id')
    .maybeSingle();

  if (!error) return (data as { id?: string } | null)?.id ?? null;
  const code = String((error as { code?: string | number }).code ?? '');
  if (code === '23505') return null; // already posted for this bucket
  console.error('[events] insert failed', code, (error as { message?: string }).message);
  return null;
}

/** Record one qualifying view of a shared document (no invoice columns change). */
export async function logDocumentView(token: string, viewer: string | null, hash: string | null): Promise<void> {
  const { error } = await adminClient().rpc('log_document_view', {
    p_token: token,
    p_viewer: viewer,
    p_viewer_hash: hash,
  });
  if (error) console.error('[events] log_document_view failed', error.code ?? error.message);
}

/** How many qualifying views a document has had in the last 24 hours (the
 *  "2nd time today" line). Includes the one just logged. Never throws. */
export async function viewsInLastDay(invoiceId: string): Promise<number> {
  try {
    const since = new Date(Date.now() - 24 * 3600e3).toISOString();
    const { count } = await adminClient()
      .from('document_views')
      .select('id', { count: 'exact', head: true })
      .eq('invoice_id', invoiceId)
      .gte('viewed_at', since);
    return count ?? 0;
  } catch {
    return 0;
  }
}
