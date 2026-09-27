// POST /api/webhooks/stripe/connect/v2 — Accounts v2 THIN events.
// Sellers' accounts are v2 accounts, and v2 reports status changes as thin
// event notifications (type + related_object id, no snapshot), which need
// their own event destination ("thin" payload style) and signing secret
// STRIPE_CONNECT_V2_WEBHOOK_SECRET, and are parsed with
// parseEventNotificationAsync — not constructEventAsync. That's why they
// don't share /api/webhooks/stripe/connect (v1 snapshot events).
//
// Handles (related_object = the seller's v2 account):
//   v2.core.account[configuration.merchant].capability_status_updated
//   v2.core.account[configuration.merchant].updated
//   v2.core.account[requirements].updated
//   v2.core.account.updated
//       → re-read the account (thin events carry no state; the fresh read also
//         makes out-of-order delivery harmless) and write the stripe_* flags.
//   v2.core.account.closed
//       → clear the account + flags, card payments off.
//
// Server-to-server → service-role admin client. runtime = 'nodejs': raw body.
// Error contract: 400 bad/missing signature · 200 ignored/unmatched ·
// 500 on DB/Stripe failure (retried) · 200 handled.
import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe/server';
import {
  ACCOUNT_INCLUDE,
  clearConnectAccount,
  statusFromV2Account,
  writeConnectStatusByAccount,
} from '@/lib/stripe/connect';

export const runtime = 'nodejs';

const REFRESH_TYPES = new Set([
  'v2.core.account[configuration.merchant].capability_status_updated',
  'v2.core.account[configuration.merchant].updated',
  'v2.core.account[requirements].updated',
  'v2.core.account.updated',
]);

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_CONNECT_V2_WEBHOOK_SECRET?.trim();
  if (!stripe || !secret) {
    return NextResponse.json({ error: 'connect_v2_webhook_not_configured' }, { status: 503 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'missing signature' }, { status: 400 });

  let notification: Awaited<ReturnType<typeof stripe.parseEventNotificationAsync>>;
  try {
    notification = await stripe.parseEventNotificationAsync(await req.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
  }

  const type = notification.type as string;
  const related = (notification as { related_object?: { id?: string; type?: string } | null }).related_object;
  const accountId = related?.id;

  try {
    let outcome: string;
    if (!accountId || !accountId.startsWith('acct_')) {
      console.log('stripe connect v2 webhook:', type, 'ignored (no account related_object)');
      return NextResponse.json({ received: true, ignored: type });
    } else if (REFRESH_TYPES.has(type)) {
      const account = await stripe.v2.core.accounts.retrieve(accountId, { include: ACCOUNT_INCLUDE });
      outcome = `status written to ${await writeConnectStatusByAccount(statusFromV2Account(account))} profile(s)`;
    } else if (type === 'v2.core.account.closed') {
      outcome = `cleared ${await clearConnectAccount(accountId)} profile(s)`;
    } else {
      console.log('stripe connect v2 webhook:', type, 'ignored');
      return NextResponse.json({ received: true, ignored: type });
    }
    console.log('stripe connect v2 webhook:', type, notification.id, outcome);
    return NextResponse.json({ received: true });
  } catch (e) {
    const err = e as { type?: string; code?: string; message?: string; details?: string; hint?: string };
    console.error('stripe connect v2 webhook handler error', type, notification.id, JSON.stringify({
      type: err?.type, code: err?.code, message: err?.message, details: err?.details, hint: err?.hint,
    }));
    return NextResponse.json({ error: 'handler failed' }, { status: 500 });
  }
}
