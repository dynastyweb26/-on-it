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
  business_name: string | null;
};

export type SubscriptionContext = {
  userId: string;
  email: string | null;
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
    .select('access_tier, stripe_customer_id, retention_offer_used_at, business_name')
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

  return { userId: user.id, email: user.email ?? null, stripe, profile: profile as SubscriptionProfile, sub };
}

export type CancelEventKind = 'cancel' | 'resume' | 'offer_discount' | 'offer_pause' | 'offer_switch_pro';

/** Append a cancel_events row (service role; clients can only read theirs).
 *  Never throws: the Stripe change already happened (or, for the store offers,
 *  the claim did), so a failed log is reported, not surfaced to the user. */
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

// ── The store offers ────────────────────────────────────────────────
// A store-billed Plus plan has NO Stripe customer and NO Stripe subscription
// (Plus is never sold through Stripe), so subscriptionContext above can never
// serve it. This is the same front half without Stripe: session auth, the
// write rate limit, and the caller's profile. The canceling and paused state
// comes from what the RevenueCat webhook already writes:
//   subscription_status      trialing | active | past_due | canceled
//   cancel_at_period_end     "will not renew"
//   paused_until             the pause ends (null = not paused)
//   retention_offer_used_at  the one-offer-per-12-months window
//   plan, access_tier, billing_source  which plan, and who bills it.
export type StoreOfferProfile = {
  access_tier: string | null;
  plan: string | null;
  billing_source: string | null;
  subscription_status: string | null;
  retention_offer_used_at: string | null;
  cancel_at_period_end: boolean | null;
  paused_until: string | null;
};

export type StoreOfferContext = {
  userId: string;
  email: string | null;
  profile: StoreOfferProfile;
};

export async function storeOfferContext(req: NextRequest): Promise<StoreOfferContext | NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, 'Sign in first.', 'unauthorized');

  if (!(await rateLimit('subscription_write', rateIdentifier(req, user.id)))) {
    return fail(429, 'Too many tries. Wait a minute and try again.', 'rate_limited');
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('access_tier, plan, billing_source, subscription_status, retention_offer_used_at, cancel_at_period_end, paused_until')
    .eq('id', user.id)
    .maybeSingle();
  if (error || !profile) return fail(500, UNAVAILABLE);
  if (profile.access_tier === 'founder') {
    return fail(403, 'You have free access. There’s no subscription to change.', 'founder');
  }

  return { userId: user.id, email: user.email ?? null, profile: profile as StoreOfferProfile };
}
