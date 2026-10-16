// Subscription state → access tier, and the profile fields we mirror from a
// Stripe subscription. Pure (no server-only, no Stripe client), so the
// webhook, the /api/subscription/* routes and the tests share one mapping.

export type SubscriptionTier = 'trialing' | 'active' | 'past_due' | 'canceled';

/** Statuses Stripe will still charge for (a live subscription). */
export const BILLABLE_STATUSES: ReadonlySet<string> = new Set(['trialing', 'active', 'past_due']);

/** The subset of a Stripe subscription this module reads. */
export type SubscriptionLike = {
  status: string;
  cancel_at_period_end?: boolean | null;
  pause_collection?: { resumes_at?: number | null } | null;
  trial_end?: number | null;
  current_period_end?: number | null;
  items?: { data?: Array<{ current_period_end?: number | null }> } | null;
};

const iso = (secs: number | null | undefined): string | null =>
  secs ? new Date(secs * 1000).toISOString() : null;

/** Stripe's status vocabulary → our access_tier. Anything not live or at-risk
 *  collapses to 'canceled' (free limits). */
export function tierFromStatus(status: string): SubscriptionTier {
  if (status === 'trialing') return 'trialing';
  if (status === 'active') return 'active';
  if (status === 'past_due') return 'past_due';
  return 'canceled'; // canceled, unpaid, incomplete, incomplete_expired, paused
}

/** The access tier for a subscription. pause_collection leaves the Stripe
 *  status 'active', so a paused subscription is checked first: while it is
 *  set the user is on the free tier ('canceled'). Once Stripe clears it the
 *  status mapping takes over again. */
export function tierForSubscription(sub: SubscriptionLike): SubscriptionTier {
  if (sub.pause_collection) return 'canceled';
  return tierFromStatus(sub.status);
}

/** current_period_end lives on the subscription in classic API versions and
 *  on the subscription item in newer ones — read whichever exists. */
export function periodEndISO(sub: SubscriptionLike): string | null {
  return iso(sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end);
}

/** The billing facts mirrored onto profiles for every user (founders too). */
export function profileFieldsFor(sub: SubscriptionLike) {
  return {
    subscription_status: sub.status,
    current_period_end: periodEndISO(sub),
    trial_ends_at: iso(sub.trial_end),
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    paused_until: sub.pause_collection ? iso(sub.pause_collection.resumes_at) : null,
  };
}

/** When access ends if nothing changes: the trial end while trialing, else
 *  the current period end. */
export function accessEndsISO(sub: SubscriptionLike): string | null {
  return sub.status === 'trialing' && sub.trial_end ? iso(sub.trial_end) : periodEndISO(sub);
}
