// POST /api/estimates/[id]/extend — move an estimate's last valid day.
// An expired-but-unsigned estimate can be extended (that is the point); an
// approved, converted or revoked one cannot.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { ExtendBodySchema } from '@/lib/estimates/schemas';
import { isOnOrAfterToday, resolveTimeZone } from '@/lib/estimates/dates';
import { isLocked, isUuid, loadOwnedQuote } from '@/lib/estimates/owner';

export const runtime = 'nodejs';

const refuse = (status: number, code: string) =>
  NextResponse.json({ error: code }, { status });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return refuse(401, 'unauthorized');
  if (!isUuid(params.id)) return refuse(404, 'not_found');

  const body = ExtendBodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return refuse(400, 'invalid_date');

  try {
    const quote = await loadOwnedQuote(params.id, user.id);
    if (!quote) return refuse(404, 'not_found');
    if (quote.approved_at) return refuse(409, 'approved');
    if (quote.revoked_at) return refuse(409, 'revoked');
    if (await isLocked(quote)) return refuse(409, 'converted');

    const { data: profile } = await adminClient()
      .from('profiles')
      .select('timezone')
      .eq('id', user.id)
      .maybeSingle();
    const tz = resolveTimeZone((profile as { timezone?: string | null } | null)?.timezone);

    if (!isOnOrAfterToday(body.data.valid_until, new Date(), tz)) {
      return refuse(400, 'past_date');
    }

    const { data: updated, error } = await adminClient()
      .from('invoices')
      .update({ valid_until: body.data.valid_until })
      .eq('id', params.id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .select('id, valid_until, status, approved_at, revoked_at')
      .maybeSingle();
    if (error) {
      console.error('estimate extend: update failed', error);
      return refuse(500, 'extend_failed');
    }
    if (!updated) return refuse(404, 'not_found');
    return NextResponse.json({ estimate: updated });
  } catch (e) {
    console.error('estimate extend: failed', e);
    return refuse(500, 'extend_failed');
  }
}
