// POST /api/plaid/link-token — create a Plaid Link token.
//   { }            → create mode (transactions, US, this preview's webhook)
//   { item_id }    → update mode (re-login for an item the caller owns)
//
// Preview only: 404 unless VERCEL_ENV === 'preview'. Node runtime. The access
// token used in update mode is decrypted for this request only and never
// appears in the response or a log.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { plaidRouteEnabled, plaidWebhookUrl } from '@/lib/plaid/config';
import { linkTokenRequest } from '@/lib/plaid/link';
import { PlaidApiError, plaidClientFromEnv } from '@/lib/plaid/client';
import { plaidAccessToken } from '@/lib/plaid/items';

export const runtime = 'nodejs';

const Body = z.object({ item_id: z.string().uuid().optional() });

const notFound = () => NextResponse.json({ error: 'not found' }, { status: 404 });

export async function POST(req: NextRequest) {
  if (!plaidRouteEnabled(process.env.VERCEL_ENV)) return notFound();

  const client = plaidClientFromEnv();
  const webhookUrl = plaidWebhookUrl(process.env.VERCEL_URL);
  if (!client || !webhookUrl) {
    return NextResponse.json({ error: 'plaid_not_configured' }, { status: 503 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!(await rateLimit('plaid_link', rateIdentifier(req, user.id)))) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid request' }, { status: 400 });

  let accessToken: string | undefined;
  if (parsed.data.item_id) {
    const admin = adminClient();
    const { data: item } = await admin
      .from('plaid_items')
      .select('id')
      .eq('id', parsed.data.item_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!item) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const token = await plaidAccessToken(admin, parsed.data.item_id);
    if (!token) {
      return NextResponse.json({ error: 'item_unavailable' }, { status: 409 });
    }
    accessToken = token;
  }

  try {
    const token = await client.linkTokenCreate(
      linkTokenRequest({ userId: user.id, webhookUrl, accessToken }),
    );
    return NextResponse.json({ link_token: token.link_token });
  } catch (error) {
    console.error('plaid: link token create failed', {
      error_code: error instanceof PlaidApiError ? error.error_code : 'unknown',
    });
    return NextResponse.json({ error: 'link_token_failed' }, { status: 502 });
  }
}
