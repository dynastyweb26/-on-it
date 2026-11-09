// Convert a signed estimate to an invoice from anywhere with a browser Supabase
// client (the chat card and the toast). The same insert the estimate detail
// screen makes, with the same idempotency key (`convert-<estimate id>`), so a
// double tap, a retry after a lost response, or the screen's own Convert can
// never mint a second numbered invoice.
//
// The card never decides paywall or errors itself: this returns the reason and
// the caller shows it (or opens the estimate, where the paywall lives).
import type { SupabaseClient } from '@supabase/supabase-js';
import { copyAttachments } from '@/lib/attachments-client';
import { defaultDueDate } from '@/lib/dates';
import { convertedDepositColumns } from '@/lib/estimates/convert';

export type ConvertOutcome =
  | { ok: true; id: string; number: number | null; existed: boolean }
  | { ok: false; reason: 'paywall' | 'not_signed' | 'not_found' | 'signed_out' | 'error' };

export type ConvertErrorLike = { code?: string; hint?: string } | null | undefined;

/** What a failed insert means. Pure so the mapping is tested. */
export function convertErrorReason(error: ConvertErrorLike): 'paywall' | 'duplicate' | 'error' {
  if (error?.hint === 'PAYWALL_LIMIT') return 'paywall';
  if (error?.code === '23505') return 'duplicate';
  return 'error';
}

export const convertKey = (estimateId: string): string => `convert-${estimateId}`;

const COLUMNS =
  'id, user_id, kind, client_id, client_name, client_address, client_phone, client_email, line_items, subtotal, tax_rate, tax_amount, total, notes, deposit_type, deposit_value, deposit_amount, approved_at, deleted_at';

export async function convertEstimateToInvoice(
  supabase: SupabaseClient,
  estimateId: string,
): Promise<ConvertOutcome> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: 'signed_out' };

  const { data: est } = await supabase.from('invoices').select(COLUMNS).eq('id', estimateId).maybeSingle();
  if (!est || est.deleted_at || est.kind !== 'quote') return { ok: false, reason: 'not_found' };
  if (!est.approved_at) return { ok: false, reason: 'not_signed' };

  const key = convertKey(estimateId);
  const { data: created, error } = await supabase.from('invoices').insert({
    user_id: est.user_id,
    client_id: est.client_id,
    kind: 'invoice',
    client_name: est.client_name,
    client_address: est.client_address ?? null,
    client_phone: est.client_phone ?? null,
    client_email: est.client_email ?? null,
    line_items: est.line_items,
    subtotal: est.subtotal,
    tax_rate: est.tax_rate,
    tax_amount: est.tax_amount,
    total: est.total,
    ...convertedDepositColumns(est),
    notes: est.notes,
    status: 'draft',
    converted_from: est.id,
    due_date: defaultDueDate(),
    finalize_key: key,
  }).select('id, invoice_number').single();

  if (error) {
    const why = convertErrorReason(error);
    if (why === 'paywall') return { ok: false, reason: 'paywall' };
    if (why === 'duplicate') {
      const { data: existing } = await supabase
        .from('invoices')
        .select('id, deleted_at, invoice_number')
        .eq('user_id', est.user_id)
        .eq('finalize_key', key)
        .maybeSingle();
      if (existing?.id) {
        if (existing.deleted_at) {
          await supabase.from('invoices').update({ deleted_at: null }).eq('id', existing.id);
        }
        return { ok: true, id: existing.id, number: existing.invoice_number ?? null, existed: true };
      }
    }
    return { ok: false, reason: 'error' };
  }
  if (!created) return { ok: false, reason: 'error' };

  const copy = await copyAttachments(supabase, est.user_id, est.id, created.id);
  if (!copy.ok) {
    await supabase.from('invoices').update({ deleted_at: new Date().toISOString() }).eq('id', created.id);
    return { ok: false, reason: 'error' };
  }
  return { ok: true, id: created.id, number: created.invoice_number ?? null, existed: false };
}
