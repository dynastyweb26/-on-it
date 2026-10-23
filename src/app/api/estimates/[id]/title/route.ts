// PATCH /api/estimates/[id]/title — set the estimate heading (max 120).
//
// Editable while the estimate is a draft or a sent-but-unsigned quote; the same
// window as the other content columns. An approved or converted estimate is
// refused here AND by guard_locked_estimate_edits for a direct REST write.
// Service role on purpose: the guard pins content at the table level, and this
// route is the one server path allowed to move it inside the window.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { TitleBodySchema } from '@/lib/estimates/schemas';
import { isLocked, isUuid, loadOwnedQuote } from '@/lib/estimates/owner';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';

export const runtime = 'nodejs';

const refuse = (status: number, code: string) =>
  NextResponse.json({ error: code }, { status });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return refuse(401, 'unauthorized');
  if (!isUuid(params.id)) return refuse(404, 'not_found');
  if (!(await rateLimit('estimate_edit', rateIdentifier(req, user.id)))) {
    return refuse(429, 'rate_limited');
  }

  const body = TitleBodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return refuse(400, 'validation');

  // An empty or whitespace-only heading clears it; the column stays NULL.
  const title = (body.data.title ?? '').trim() || null;

  try {
    const quote = await loadOwnedQuote(params.id, user.id);
    if (!quote) return refuse(404, 'not_found');
    if (await isLocked(quote)) return refuse(409, 'locked');

    const { data: updated, error } = await adminClient()
      .from('invoices')
      .update({ title })
      .eq('id', params.id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .select('id, title')
      .maybeSingle();
    if (error) {
      console.error('estimate title: update failed', error);
      return refuse(500, 'title_failed');
    }
    if (!updated) return refuse(404, 'not_found');
    return NextResponse.json({ estimate: updated });
  } catch (e) {
    console.error('estimate title: failed', e);
    return refuse(500, 'title_failed');
  }
}
