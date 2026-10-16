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
  items?: { data?: Array<{ current_period_end?: number | null; current_period_start?: number | null }> } | null;
  metadata?: Record<string, string> | null;
};

/** Subscription metadata key: when an in-app pause takes effect (unix
 *  seconds) — the period end at the moment the pause was taken. Stored on
 *  the subscription because current_period_end moves forward at every
 *  renewal, including the voided ones while paused, so it can't be the
 *  anchor after the first rollover. */
export const PAUSE_FROM_KEY = 'onit_pause_from';

/** When the pause takes effect (unix seconds), or null (no anchor: a pause
 *  set outside the app takes effect immediately). */
export function pauseStartsAt(sub: SubscriptionLike): number | null {
  const raw = Number(sub.metadata?.[PAUSE_FROM_KEY]);
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

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

/** The access tier for a subscription at `now`. pause_collection leaves the
 *  Stripe status 'active', so a paused subscription is checked first. The
 *  pause starts at the end of the period already paid for: until then the
 *  status mapping applies (full access); from then on, while
 *  pause_collection is set, the free tier ('canceled'). Once Stripe clears
 *  it the status mapping takes over again. The renewal at the pause start
 *  fires customer.subscription.updated, which re-syncs the tier. */
export function tierForSubscription(sub: SubscriptionLike, now: Date = new Date()): SubscriptionTier {
  if (sub.pause_collection) {
    const from = pauseStartsAt(sub);
    // "Now" is never earlier than the current period's start. In production
    // the period start is always in the past, so this is just `now`; under a
    // Stripe test clock the subscription lives in the clock's time and the
    // renewal event arrives in real time, so the period start is the clock.
    const start = sub.items?.data?.[0]?.current_period_start;
    const t = Math.max(now.getTime(), start ? start * 1000 : 0);
    if (from !== null && t < from * 1000) return tierFromStatus(sub.status);
    return 'canceled';
  }
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
