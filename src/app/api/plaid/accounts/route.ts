// POST /api/plaid/accounts — turn tracking on/off for one account.
// Only tracked accounts produce bank_transactions; tracking is opt-in and the
// schema requires track and tracked_at to move together.
//
// Preview only: 404 unless VERCEL_ENV === 'preview'. Node runtime.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { plaidRouteEnabled } from '@/lib/plaid/config';
import { trackPatch } from '@/lib/plaid/link';

export const runtime = 'nodejs';

const Body = z.object({
  item_id: z.string().uuid(),
  account_id: z.string().uuid(),
  track: z.boolean(),
});

const notFound = () => NextResponse.json({ error: 'not found' }, { status: 404 });

export async function POST(req: NextRequest) {
  if (!plaidRouteEnabled(process.env.VERCEL_ENV)) return notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!(await rateLimit('plaid_accounts', rateIdentifier(req, user.id)))) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid request' }, { status: 400 });
  const { item_id, account_id, track } = parsed.data;

  const admin = adminClient();
  const { data: updated, error } = await admin
    .from('plaid_accounts')
    .update(trackPatch(track, new Date().toISOString()))
    .eq('id', account_id)
    .eq('item_id', item_id)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'update_failed' }, { status: 500 });
  if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const { data: accounts } = await admin
    .from('plaid_accounts')
    .select('id, plaid_account_id, name, official_name, mask, type, subtype, track, tracked_at')
    .eq('item_id', item_id)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  return NextResponse.json({ ok: true, accounts: accounts ?? [] });
}
