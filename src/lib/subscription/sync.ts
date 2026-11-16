// Stripe subscription → profiles, on the service role. Shared by the Stripe
// webhook and the /api/subscription/* routes, so a route can write the same
// state the webhook will (a refresh right after Cancel already shows it) and
// the webhook stays the source of truth when it lands.
//
// Every write goes through writeBillingFields: billing_source decides whether
// Stripe may touch the row at all (a store-owned, live profile is not Stripe's),
// and the tier/plan writes additionally skip a founder. Billing facts may still
// be written for a founder — only their tier and plan are frozen.
import 'server-only';
import type Stripe from 'stripe';
import { adminClient } from '@/lib/supabase/admin';
import { writeBillingFields, type BillingWrite, type ProfileMatch } from '@/lib/billing-write';
import { BILLABLE_STATUSES, planFromTier, profileFieldsFor, tierForSubscription, type SubscriptionTier } from './state';

type Admin = ReturnType<typeof adminClient>;

/** Write billing fields for Stripe, under the source rule. */
function writeStripe(
  supabase: Admin,
  match: ProfileMatch,
  fields: Record<string, unknown>,
  guardFounder: boolean,
): Promise<boolean> {
  const write: BillingWrite = { writer: 'stripe', match, fields, guardFounder };
  return writeBillingFields(supabase, write);
}

/** Never downgrade a founder — grants outrank subscriptions. The founder check
 *  is part of the UPDATE itself, together with the source rule, so it is
 *  atomic: a code redeemed (or a store purchase made) while an event is in
 *  flight can't be overwritten. */
export async function setTierUnlessFounder(
  supabase: Admin,
  match: ProfileMatch,
  tier: SubscriptionTier,
) {
  await writeStripe(supabase, match, { access_tier: tier }, true);
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
  match: ProfileMatch,
  plan: 'pro' | 'plus',
) {
  try {
    await writeStripe(supabase, match, { plan }, true);
  } catch (error) {
    if (isMissingPlanColumn(error as { code?: string; message?: string })) {
      console.warn('stripe sync: profiles.plan not migrated yet, plan not written');
      return;
    }
    throw error;
  }
}

/** Record a subscription on its profile: billing facts (for everyone,
 *  founders included), then the access tier and the paid plan (never for a
 *  founder). Throws on DB failure (the webhook turns that into a 500 so Stripe
 *  retries). */
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

  await writeStripe(supabase, { id }, {
    stripe_customer_id: customerId,
    ...profileFieldsFor(sub),
  }, false);

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
