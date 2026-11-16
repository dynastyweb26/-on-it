// Stripe subscription → profiles, on the service role. Shared by the Stripe
// webhook and the /api/subscription/* routes, so a route can write the same
// state the webhook will (a refresh right after Cancel already shows it) and
// the webhook stays the source of truth when it lands.
import 'server-only';
import type Stripe from 'stripe';
import { adminClient } from '@/lib/supabase/admin';
import { BILLABLE_STATUSES, planFromTier, profileFieldsFor, tierForSubscription, type SubscriptionTier } from './state';

type Admin = ReturnType<typeof adminClient>;
type Match = { id: string } | { stripe_customer_id: string };

/** One UPDATE that skipped every founder. The founder check is part of the
 *  UPDATE itself (WHERE access_tier is not 'founder'), so it is atomic: a code
 *  redeemed while an event is in flight can't be overwritten by a value read a
 *  moment earlier. (A read-then-write here raced exactly that.) */
async function updateUnlessFounder(supabase: Admin, match: Match, fields: Record<string, unknown>) {
  let q = supabase.from('profiles').update(fields);
  q = 'id' in match ? q.eq('id', match.id) : q.eq('stripe_customer_id', match.stripe_customer_id);
  const { error } = await q.or('access_tier.is.null,access_tier.neq.founder');
  if (error) throw error;
}

/** Never downgrade a founder — grants outrank subscriptions. */
export async function setTierUnlessFounder(
  supabase: Admin,
  match: Match,
  tier: SubscriptionTier,
) {
  await updateUnlessFounder(supabase, match, { access_tier: tier });
}

/** profiles.plan arrives with the tiers migration (20261116090000). Until that
 *  is applied the column doesn't exist and PostgREST answers PGRST204; that is
 *  the one error a plan write ignores, so billing keeps working on a database
 *  that hasn't been migrated yet. Everything else still throws. */
function isMissingPlanColumn(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST204' && (error.message ?? '').includes("'plan'");
}

/** Write the plan a tier buys ('pro'), never touching a founder. */
export async function setPlanUnlessFounder(
  supabase: Admin,
  match: Match,
  plan: 'pro' | 'plus',
) {
  let q = supabase.from('profiles').update({ plan });
  q = 'id' in match ? q.eq('id', match.id) : q.eq('stripe_customer_id', match.stripe_customer_id);
  const { error } = await q.or('access_tier.is.null,access_tier.neq.founder');
  if (!error) return;
  if (isMissingPlanColumn(error)) {
    console.warn('stripe sync: profiles.plan not migrated yet, plan not written');
    return;
  }
  throw error;
}

/** Record a subscription on its profile: billing facts for everyone, the
 *  access tier and the paid plan for non-founders. Throws on DB failure (the
 *  webhook turns that into a 500 so Stripe retries). */
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

  const tier = tierForSubscription(sub);
  await setTierUnlessFounder(supabase, { id }, tier);
  // Trialing / active → plan 'pro'. past_due and canceled leave the stored
  // plan alone (access_tier already decides what they can do).
  const plan = planFromTier(tier);
  if (plan) await setPlanUnlessFounder(supabase, { id }, plan);
}

/** The customer's live (billable) subscription, newest first, or null. */
export async function findLiveSubscription(stripe: Stripe, customer: string): Promise<Stripe.Subscription | null> {
  const subs = await stripe.subscriptions.list({ customer, status: 'all', limit: 20 });
  return subs.data
    .filter((s) => BILLABLE_STATUSES.has(s.status))
    .sort((a, b) => b.created - a.created)[0] ?? null;
}
