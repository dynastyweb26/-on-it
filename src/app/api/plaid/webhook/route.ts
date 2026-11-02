// POST /api/plaid/webhook — Plaid's server-to-server notifications.
//
// UNAUTHENTICATED but verified: the Plaid-Verification JWT is checked with
// node:crypto (ES256, key cached by kid, iat within 5 minutes, request body
// SHA-256 must match the claim). No session, no cookie, no trust in the body.
//
// Preview only: 404 unless VERCEL_ENV === 'preview'. Node runtime.
//
// SYNC_UPDATES_AVAILABLE: answer 200 first, then let the sync run after the
// response (waitUntil on Vercel; an inline await when that is unavailable).
// ITEM/PENDING_EXPIRATION and ITEM/ERROR mark the item needs_reconnect.
import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { adminClient } from '@/lib/supabase/admin';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { plaidRouteEnabled } from '@/lib/plaid/config';
import { PlaidApiError, plaidClientFromEnv } from '@/lib/plaid/client';
import { createWebhookVerifier } from '@/lib/plaid/webhook-verify';
import { markItemNeedsReconnect } from '@/lib/plaid/items';
import { syncPlaidItemByPlaidItemId } from '@/lib/plaid/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const notFound = () => NextResponse.json({ error: 'not found' }, { status: 404 });

type WebhookBody = {
  webhook_type?: string;
  webhook_code?: string;
  item_id?: string;
};

export async function POST(req: NextRequest) {
  if (!plaidRouteEnabled(process.env.VERCEL_ENV)) return notFound();

  const client = plaidClientFromEnv();
  if (!client) return NextResponse.json({ error: 'plaid_not_configured' }, { status: 503 });

  if (!(await rateLimit('plaid_webhook', rateIdentifier(req)))) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }

  // Raw body: the signature covers these exact bytes.
  const raw = await req.text();

  const verify = createWebhookVerifier(async (kid) => {
    const { key } = await client.webhookVerificationKeyGet(kid);
    return key;
  });
  const verified = await verify(req.headers.get('plaid-verification'), raw);
  if (!verified.ok) {
    // The reason is useful on the server and useless to an attacker.
    console.error('plaid: webhook verification failed', { reason: verified.reason });
    return NextResponse.json({ error: 'invalid verification' }, { status: 401 });
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(raw) as WebhookBody;
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const itemId = typeof body.item_id === 'string' ? body.item_id : null;
  const admin = adminClient();

  if (
    body.webhook_type === 'ITEM' &&
    (body.webhook_code === 'PENDING_EXPIRATION' || body.webhook_code === 'ERROR') &&
    itemId
  ) {
    // A single metadata update; fast enough to wait for.
    try {
      await markItemNeedsReconnect(admin, itemId, body.webhook_code);
    } catch (error) {
      console.error('plaid: failed to mark item needs_reconnect', {
        error_code: (error as { code?: string } | null)?.code ?? 'unknown',
      });
    }
    return NextResponse.json({ received: true });
  }

  if (body.webhook_type === 'TRANSACTIONS' && body.webhook_code === 'SYNC_UPDATES_AVAILABLE' && itemId) {
    const response = NextResponse.json({ received: true });
    const task = syncPlaidItemByPlaidItemId(client, admin, itemId)
      .then((summary) => {
        if (!summary) console.warn('plaid: webhook for an unknown item', { item_id: itemId });
      })
      .catch((error: unknown) => {
        console.error('plaid: webhook sync failed', {
          item_id: itemId,
          error_code: error instanceof PlaidApiError ? error.error_code : 'sync_failed',
        });
      });
    try {
      waitUntil(task);
    } catch {
      // Outside a Vercel request (or with no waitUntil support): keep the
      // function alive for the bounded sync instead of dropping it.
      await task;
    }
    return response;
  }

  // Acknowledged, not processed — Plaid must not retry it.
  return NextResponse.json({ received: true });
}
