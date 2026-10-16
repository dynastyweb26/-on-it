// Shared front half of every /api/subscription/* write route: session auth,
// rate limit, Stripe configured (dormant-safe 503 like billing-portal), the
// caller's profile, and their live Stripe subscription. Founders never get
// here (403): they have no subscription to change.
//
// The profile is read with the session client (RLS); every write a route
// makes goes through the service role (lib/subscription/sync, logEvent).
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { getStripe } from '@/lib/stripe/server';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { findLiveSubscription } from './sync';

export type SubscriptionProfile = {
  access_tier: string | null;
  stripe_customer_id: string | null;
  retention_offer_used_at: string | null;
};

export type SubscriptionContext = {
  userId: string;
  stripe: Stripe;
  profile: SubscriptionProfile;
  sub: Stripe.Subscription;
};

const UNAVAILABLE = 'That’s not available right now — try again shortly.';

export const fail = (status: number, message: string, error = 'failed') =>
  NextResponse.json({ ok: false, error, message }, { status });

export async function subscriptionContext(req: NextRequest): Promise<SubscriptionContext | NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, 'Sign in first.', 'unauthorized');

  if (!(await rateLimit('subscription_write', rateIdentifier(req, user.id)))) {
    return fail(429, 'Too many tries. Wait a minute and try again.', 'rate_limited');
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('access_tier, stripe_customer_id, retention_offer_used_at')
    .eq('id', user.id)
    .maybeSingle();
  if (error) return fail(500, UNAVAILABLE);
  if (profile?.access_tier === 'founder') {
    return fail(403, 'You have free access. There’s no subscription to change.', 'founder');
  }

  const stripe = getStripe();
  if (!stripe || !profile?.stripe_customer_id) {
    return fail(503, 'Billing management isn’t available yet.', 'billing_not_configured');
  }

  let sub: Stripe.Subscription | null;
  try {
    sub = await findLiveSubscription(stripe, profile.stripe_customer_id);
  } catch (e) {
    console.error('subscription: list failed', (e as Error)?.message);
    return fail(502, UNAVAILABLE);
  }
  if (!sub) return fail(409, 'There’s no active subscription on this account.', 'no_subscription');

  return { userId: user.id, stripe, profile: profile as SubscriptionProfile, sub };
}

export type CancelEventKind = 'cancel' | 'resume' | 'offer_discount' | 'offer_pause';

/** Append a cancel_events row (service role; clients can only read theirs).
 *  Never throws: the Stripe change already happened, so a failed log is
 *  reported, not surfaced to the user. */
export async function logEvent(userId: string, row: {
  kind: CancelEventKind; reason?: string | null; detail?: string | null; months?: number | null;
}) {
  const { error } = await adminClient().from('cancel_events').insert({
    user_id: userId,
    kind: row.kind,
    reason: row.reason ?? null,
    detail: row.detail ?? null,
    months: row.months ?? null,
    platform: 'web', // these routes are the Stripe (web) billing path
  });
  if (error) console.error('cancel_events insert failed', row.kind, error.code ?? error.message);
}
