// POST /api/subscription/resume — undo a pending cancel or end a pause
// (CANCEL-FLOW-SPEC.md §1, §4). No offer, no friction.
//   paused   → clear pause_collection (billing and full access pick back up)
//   canceling → cancel_at_period_end: false
// A pause is cleared first; a subscription that is both paused and canceling
// gets both cleared in one update. Neither → ok, nothing to do.
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { applySubscription } from '@/lib/subscription/sync';
import { fail, logEvent, subscriptionContext } from '@/lib/subscription/route';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const ctx = await subscriptionContext(req);
  if (ctx instanceof NextResponse) return ctx;
  const { userId, stripe, sub } = ctx;

  const params: Stripe.SubscriptionUpdateParams = {};
  if (sub.pause_collection) params.pause_collection = '';
  if (sub.cancel_at_period_end) params.cancel_at_period_end = false;
  if (Object.keys(params).length === 0) return NextResponse.json({ ok: true, changed: false });

  let updated;
  try {
    updated = await stripe.subscriptions.update(sub.id, params);
  } catch (e) {
    console.error('subscription resume failed', (e as Error)?.message);
    return fail(502, 'Couldn’t resume just now. Try again in a moment.');
  }

  try { await applySubscription(updated, userId); } catch (e) {
    console.error('subscription resume: profile sync failed', (e as { code?: string })?.code);
  }
  await logEvent(userId, { kind: 'resume' });

  return NextResponse.json({ ok: true, changed: true });
}
