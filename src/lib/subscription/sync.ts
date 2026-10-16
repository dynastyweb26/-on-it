// Stripe subscription → profiles, on the service role. Shared by the Stripe
// webhook and the /api/subscription/* routes, so a route can write the same
// state the webhook will (a refresh right after Cancel already shows it) and
// the webhook stays the source of truth when it lands.
import 'server-only';
import type Stripe from 'stripe';
import { adminClient } from '@/lib/supabase/admin';
import { BILLABLE_STATUSES, profileFieldsFor, tierForSubscription, type SubscriptionTier } from './state';

type Admin = ReturnType<typeof adminClient>;

/** Never downgrade a founder — grants outrank subscriptions. The founder check
 *  is part of the UPDATE itself (WHERE access_tier is not 'founder'), so it is
 *  atomic: a code redeemed while an event is in flight can't be overwritten
 *  by a tier read a moment earlier. (A read-then-write here raced exactly that.) */
export async function setTierUnlessFounder(
  supabase: Admin,
  match: { id: string } | { stripe_customer_id: string },
  tier: SubscriptionTier,
) {
  let q = supabase.from('profiles').update({ access_tier: tier });
  q = 'id' in match ? q.eq('id', match.id) : q.eq('stripe_customer_id', match.stripe_customer_id);
  const { error } = await q.or('access_tier.is.null,access_tier.neq.founder');
  if (error) throw error;
}

/** Record a subscription on its profile: billing facts for everyone, the
 *  access tier for non-founders. Throws on DB failure (the webhook turns that
 *  into a 500 so Stripe retries). */
export async function applySubscription(sub: Stripe.Subscription, explicitUserId?: string) {
  const supabase = adminClient();
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

  // Resolve the profile: explicit user id (checkout / routes) or by customer id.
  let id = explicitUserId ?? sub.metadata?.user_id;
  if (!id) {
    const { data, error } = await supabase
      .from('profiles').select('id').eq('stripe_customer_id', customerId).maybeSingle();
    if (error) throw error;
    id = data?.id;
  }
  if (!id) { console.warn('stripe sync: no profile for customer', customerId); return; }

  const { error: updErr } = await supabase.from('profiles').update({
    stripe_customer_id: customerId,
    ...profileFieldsFor(sub),
  }).eq('id', id);
  if (updErr) throw updErr;

  await setTierUnlessFounder(supabase, { id }, tierForSubscription(sub));
}

/** The customer's live (billable) subscription, newest first, or null. */
export async function findLiveSubscription(stripe: Stripe, customer: string): Promise<Stripe.Subscription | null> {
  const subs = await stripe.subscriptions.list({ customer, status: 'all', limit: 20 });
  return subs.data
    .filter((s) => BILLABLE_STATUSES.has(s.status))
    .sort((a, b) => b.created - a.created)[0] ?? null;
}
