// PATCH /api/estimates/[id]/edits — save the owner's in-place edits.
//
// 4A edit-in-place writes ONE update per save, so bump_estimate_version sees a
// single statement and bumps the version once however many fields changed.
//
// It runs on the USER'S SESSION client, never the service role: RLS scopes the
// row to its owner, and guard_locked_estimate_edits / pin_invoice_server_columns
// apply exactly as they do for any other client write. The route adds only the
// batch shape, the explicit ownership/state checks and the totals recomputation.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { calculateInvoiceTotals, type DepositType, type FinancialLineItem } from '@/lib/financials';
import { isUuid } from '@/lib/estimates/owner';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';

export const runtime = 'nodejs';

const refuse = (status: number, code: string) =>
  NextResponse.json({ error: code }, { status });

const EditsBody = z.object({
  title: z.string().max(120).nullable().optional(),
  line_items: z.array(z.record(z.string(), z.unknown())).max(200).optional(),
}).refine((v) => v.title !== undefined || v.line_items !== undefined, {
  message: 'nothing to save',
});

type EditableRow = {
  id: string; user_id: string; kind: string | null; deleted_at: string | null;
  approved_at: string | null; tax_rate: number | string | null;
  deposit_type: string | null; deposit_value: number | string | null;
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
    .select('id, user_id, kind, deleted_at, approved_at, tax_rate, deposit_type, deposit_value')
    .eq('id', params.id)
    .maybeSingle();
  if (readError) {
    console.error('estimate edits: read failed', readError.code ?? readError.message);
    return refuse(500, 'save_failed');
  }
  const row = data as EditableRow | null;
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

  const patch: Record<string, unknown> = {};
  if (body.data.title !== undefined) {
    // An empty or whitespace-only heading clears it; the column stays NULL.
    patch.title = (body.data.title ?? '').trim() || null;
  }
  if (body.data.line_items !== undefined) {
    const items = body.data.line_items as unknown as FinancialLineItem[];
    // The document's own tax rate and deposit settings, never the caller's.
    const totals = calculateInvoiceTotals(
      items,
      Number(row.tax_rate ?? 0),
      ((row.deposit_type as DepositType | null) ?? 'none'),
      row.deposit_value == null ? undefined : Number(row.deposit_value),
    );
    patch.line_items = items;
    patch.subtotal = totals.subtotal;
    patch.tax_amount = totals.taxAmount;
    patch.total = totals.total;
  }

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
