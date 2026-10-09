// ═══ Subscription → profiles access: the ONE write ═══
// Both the Stripe webhook (/api/webhooks/stripe) and the Checkout return
// (/api/checkout/confirm) record a subscription through applySubscription, so
// the founder rule and the status → tier mapping live in one place.
// Service role: the user can't write access_tier or the stripe_* columns
// under their own grants (20260925000001_profiles_lock_privileges).
import 'server-only';
import type Stripe from 'stripe';
import { adminClient } from '@/lib/supabase/admin';

export type SubscriptionTier = 'trialing' | 'active' | 'past_due' | 'canceled';

// Stripe's tier vocabulary → our access_tier. Anything not a live/at-risk
// status collapses to 'canceled' (no access).
export function tierFromStatus(status: Stripe.Subscription.Status): SubscriptionTier {
  if (status === 'trialing') return 'trialing';
  if (status === 'active') return 'active';
  if (status === 'past_due') return 'past_due';
  return 'canceled'; // canceled, unpaid, incomplete, incomplete_expired, paused
}

// current_period_end lives on the subscription in classic API versions and on
// the subscription item in newer ones — read whichever exists.
export function periodEndISO(sub: Stripe.Subscription): string | null {
  const raw =
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    sub.items?.data?.[0]?.current_period_end;
  return raw ? new Date(raw * 1000).toISOString() : null;
}

// Throws on DB failure so the caller can fail loudly (the webhook returns 500
// and Stripe retries).
export async function applySubscription(sub: Stripe.Subscription, explicitUserId?: string) {
  const supabase = adminClient();
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

  // Resolve the profile: explicit user id (checkout) or by customer id (updates).
  let id = explicitUserId ?? sub.metadata?.user_id;
  if (!id) {
    const { data, error } = await supabase
      .from('profiles').select('id').eq('stripe_customer_id', customerId).maybeSingle();
    if (error) throw error;
    id = data?.id;
  }
  if (!id) { console.warn('stripe: no profile for customer', customerId); return; }

  // Billing facts are recorded for everyone (founders included).
  const { error: updErr } = await supabase.from('profiles').update({
    stripe_customer_id: customerId,
    subscription_status: sub.status,
    current_period_end: periodEndISO(sub),
    trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
  }).eq('id', id);
  if (updErr) throw updErr;

  await setTierUnlessFounder(supabase, { id }, tierFromStatus(sub.status));
}

// Never downgrade a founder — grants outrank subscriptions. The founder check
// is part of the UPDATE itself (WHERE access_tier is not 'founder'), so it is
// atomic: a code redeemed while this write is in flight can't be overwritten
// by a tier read a moment earlier. (A read-then-write here raced exactly that.)
export async function setTierUnlessFounder(
  supabase: ReturnType<typeof adminClient>,
  match: { id: string } | { stripe_customer_id: string },
  tier: SubscriptionTier,
) {
  let q = supabase.from('profiles').update({ access_tier: tier });
  q = 'id' in match ? q.eq('id', match.id) : q.eq('stripe_customer_id', match.stripe_customer_id);
  const { error } = await q.or('access_tier.is.null,access_tier.neq.founder');
  if (error) throw error;
}
