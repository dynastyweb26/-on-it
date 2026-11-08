// PATCH /api/estimates/[id]/edits — save the owner's in-place edits.
//
// 4A edit-in-place writes ONE update per save, so bump_estimate_version sees a
// single statement and bumps the version once however many fields changed.
//
// It runs on the USER'S SESSION client, never the service role: RLS scopes the
// row to its owner, and guard_locked_estimate_edits / pin_invoice_server_columns
// apply exactly as they do for any other client write. The route adds only the
// batch shape, the explicit ownership/state checks and the totals recomputation.
//
// The accepted fields are the content a chat revise can change (see
// lib/estimates/edits): title, line items, notes, tax, deposit, due date. Client
// identity, the number, the public token, status, kind and finalize_key are
// refused by the schema, so a revision cannot mint a new document.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isUuid } from '@/lib/estimates/owner';
import { EditsBody, buildEditsPatch, type EditableRow } from '@/lib/estimates/edits';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';

export const runtime = 'nodejs';

const refuse = (status: number, code: string) =>
  NextResponse.json({ error: code }, { status });

type EditableEstimateRow = EditableRow & {
  id: string; user_id: string; kind: string | null; deleted_at: string | null;
  approved_at: string | null;
};

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return refuse(401, 'unauthorized');
  if (!isUuid(params.id)) return refuse(404, 'not_found');
  if (!(await rateLimit('estimate_edit', rateIdentifier(req, user.id)))) {
    return refuse(429, 'rate_limited');
  }

  const body = EditsBody.safeParse(await req.json().catch(() => null));
  if (!body.success) return refuse(400, 'validation');

  const { data, error: readError } = await supabase
    .from('invoices')
    .select('id, user_id, kind, deleted_at, approved_at, tax_rate, deposit_type, deposit_value, line_items')
    .eq('id', params.id)
    .maybeSingle();
  if (readError) {
    console.error('estimate edits: read failed', readError.code ?? readError.message);
    return refuse(500, 'save_failed');
  }
  const row = data as EditableEstimateRow | null;
  // RLS already hides another owner's row; naming each condition keeps the
  // contract explicit if this ever moves off the session client.
  if (!row || row.user_id !== user.id || row.kind !== 'quote' || row.deleted_at) {
    return refuse(404, 'not_found');
  }
  if (row.approved_at) return refuse(409, 'locked');

  const { data: convertedRows, error: convertedError } = await supabase
    .from('invoices')
    .select('id')
    .eq('converted_from', params.id)
    .is('deleted_at', null)
    .limit(1);
  if (convertedError) {
    console.error('estimate edits: converted check failed', convertedError.code ?? convertedError.message);
    return refuse(500, 'save_failed');
  }
  if ((convertedRows ?? []).length > 0) return refuse(409, 'locked');

  const patch = buildEditsPatch(row, body.data);

  const { data: updated, error } = await supabase
    .from('invoices')
    .update(patch)
    .eq('id', params.id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .select('id, title, line_items, subtotal, tax_rate, tax_amount, total, estimate_version')
    .maybeSingle();
  if (error) {
    // guard_locked_estimate_edits raises 42501 for a signed or converted row.
    const locked = error.code === '42501';
    console.error('estimate edits: update failed', error.code ?? error.message);
    return refuse(locked ? 409 : 500, locked ? 'locked' : 'save_failed');
  }
  if (!updated) return refuse(404, 'not_found');

  // The row comes back as stored: the card replaces its drafts with this.
  return NextResponse.json({ estimate: updated });
}
