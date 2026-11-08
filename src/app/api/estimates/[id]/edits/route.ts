// PATCH /api/estimates/[id]/edits — save the owner's in-place edits.
//
// 4A edit-in-place writes ONE update per save, so the BEFORE trigger on
// invoices (bump_estimate_version) sees a single statement and bumps the
// version once, no matter how many fields changed. Service role on purpose:
// guard_locked_estimate_edits pins content at the table level for clients, and
// this route is the one server path allowed to move it inside the window.
//
// Title and line items travel together; the totals are recomputed here from the
// line items and the row's own tax_rate, so a client cannot send a total that
// disagrees with what it saved.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { calculateInvoiceTotals, type FinancialLineItem } from '@/lib/financials';
import { isLocked, isUuid, loadOwnedQuote } from '@/lib/estimates/owner';
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

  try {
    const quote = await loadOwnedQuote(params.id, user.id);
    if (!quote) return refuse(404, 'not_found');
    if (await isLocked(quote)) return refuse(409, 'locked');

    const patch: Record<string, unknown> = {};
    if (body.data.title !== undefined) {
      // An empty or whitespace-only heading clears it; the column stays NULL.
      patch.title = (body.data.title ?? '').trim() || null;
    }
    if (body.data.line_items !== undefined) {
      const items = body.data.line_items as unknown as FinancialLineItem[];
      const totals = calculateInvoiceTotals(items, Number(quote.tax_rate ?? 0));
      patch.line_items = items;
      patch.subtotal = totals.subtotal;
      patch.tax_amount = totals.taxAmount;
      patch.total = totals.total;
    }

    const { data: updated, error } = await adminClient()
      .from('invoices')
      .update(patch)
      .eq('id', params.id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .select('id, title, line_items, subtotal, tax_rate, tax_amount, total, estimate_version')
      .maybeSingle();
    if (error) {
      console.error('estimate edits: update failed', error.code ?? error.message);
      return refuse(500, 'save_failed');
    }
    if (!updated) return refuse(404, 'not_found');
    return NextResponse.json({ estimate: updated });
  } catch (e) {
    console.error('estimate edits: failed', e);
    return refuse(500, 'save_failed');
  }
}
