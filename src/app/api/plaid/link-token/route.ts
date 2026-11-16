// POST /api/plaid/link-token — create a Plaid Link token.
//   { }            → create mode (transactions, US, this preview's webhook)
//   { item_id }    → update mode (re-login for an item the caller owns)
//
// Preview only: 404 unless VERCEL_ENV === 'preview'. Node runtime. The access
// token used in update mode is decrypted for this request only and never
// appears in the response or a log. Every non-2xx goes through fail(), which
// logs exactly one line: route, status, reason code.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { plaidRouteEnabled, plaidWebhookUrl } from '@/lib/plaid/config';
import { linkTokenRequest } from '@/lib/plaid/link';
import { PlaidApiError, plaidClientFromEnv } from '@/lib/plaid/client';
import { plaidAccessToken } from '@/lib/plaid/items';
import { fail } from '@/lib/plaid/respond';
import { newPlaidLinkAllowed } from '@/lib/plaid/plan-server';
import { planLockBody } from '@/lib/plan-lock';
import { NEXT_PUBLIC_TIERS } from '@/lib/feature-flags';

export const runtime = 'nodejs';

const Body = z.object({ item_id: z.string().uuid().optional() });

export async function POST(req: NextRequest) {
  if (!plaidRouteEnabled(process.env.VERCEL_ENV)) return fail('link-token', 'route_disabled');

  const client = plaidClientFromEnv();
  const webhookUrl = plaidWebhookUrl(process.env.VERCEL_URL);
  if (!client || !webhookUrl) return fail('link-token', 'plaid_not_configured');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('link-token', 'unauthorized');

  if (!(await rateLimit('plaid_link', rateIdentifier(req, user.id)))) {
    return fail('link-token', 'rate_limited');
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail('link-token', 'invalid_request');

  // Tiers: only a NEW link needs Plus. Update mode (an item_id the caller owns)
  // is never gated — a bank already connected keeps working after a lapse, and
  // it is checked before any Plaid call or token decryption.
  if (!parsed.data.item_id && !(await newPlaidLinkAllowed(supabase, user.id, NEXT_PUBLIC_TIERS))) {
    // The one typed lock shape: { error, feature, planRequired }.
    return fail('link-token', 'plan_required', null, planLockBody('bank'));
  }

  let accessToken: string | undefined;
  if (parsed.data.item_id) {
    const admin = adminClient();
    const { data: item } = await admin
      .from('plaid_items')
      .select('id')
      .eq('id', parsed.data.item_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!item) return fail('link-token', 'not_found');

    const token = await plaidAccessToken(admin, parsed.data.item_id);
    if (!token) return fail('link-token', 'item_unavailable');
    accessToken = token;
  }

  try {
    const token = await client.linkTokenCreate(
      linkTokenRequest({ userId: user.id, webhookUrl, accessToken }),
    );
    return NextResponse.json({ link_token: token.link_token });
  } catch (error) {
    return fail(
      'link-token',
      'link_token_failed',
      error instanceof PlaidApiError ? error.error_code : null,
    );
  }
}
