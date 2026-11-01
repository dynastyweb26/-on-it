// POST /api/plaid/disconnect — /item/remove, then drop the local item.
// The item delete cascades plaid_accounts and bank_transactions; expenses are
// untouched (their plaid_transaction_id is only a tag).
//
// A Plaid-side failure never traps the owner: the local row is deleted anyway,
// the stale token is unusable at Plaid, and only an error code is logged.
//
// Preview only: 404 unless VERCEL_ENV === 'preview'. Node runtime. Every
// non-2xx goes through fail(), which logs exactly one line.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { plaidRouteEnabled } from '@/lib/plaid/config';
import { plaidClientFromEnv } from '@/lib/plaid/client';
import { removePlaidItem } from '@/lib/plaid/items';
import { fail } from '@/lib/plaid/respond';

export const runtime = 'nodejs';

const Body = z.object({ item_id: z.string().uuid() });

export async function POST(req: NextRequest) {
  if (!plaidRouteEnabled(process.env.VERCEL_ENV)) return fail('disconnect', 'route_disabled');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('disconnect', 'unauthorized');

  if (!(await rateLimit('plaid_disconnect', rateIdentifier(req, user.id)))) {
    return fail('disconnect', 'rate_limited');
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail('disconnect', 'invalid_request');

  const admin = adminClient();
  const { data: item } = await admin
    .from('plaid_items')
    .select('id')
    .eq('id', parsed.data.item_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!item) return fail('disconnect', 'not_found');

  try {
    const result = await removePlaidItem(plaidClientFromEnv(), admin, parsed.data.item_id, user.id);
    return NextResponse.json({ ok: true, plaid_removed: result.plaidRemoved });
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    return fail('disconnect', 'db_delete_failed', typeof code === 'string' ? code : null);
  }
}
