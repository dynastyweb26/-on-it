// ═══ "Switch to Pro" from the cancel screen ═══
// TIERS-SPEC, "Cancel flow with two plans": a Plus user who picks "Too
// expensive" is offered the switch to Pro (a downgrade at period end) or 50%
// off, and taking the switch COUNTS AS THE OFFER TAKEN — the same 12-month
// window a discount or a pause spends.
//
// This is the decision in front of that claim, pure so it is testable without
// Stripe, a database or a flag: the route reads the live subscription and the
// profile, and asks here. The route then claims the window atomically and
// records the offer; nothing here charges or changes a subscription.
import { cancelOffersFor, offerEligible, type OfferState } from './offers';
import type { BillingSource } from '../billing-source';
import { entitlementsFor, type TierPlan } from '../entitlements';

export type SwitchProRefusal =
  /** The flag is off: the kind does not exist in this build. */
  | 'not_available'
  /** Not a Plus user, already canceling/paused, already on an offer, etc. */
  | 'not_eligible';

export type SwitchProDecision =
  | { ok: true }
  | { ok: false; error: SwitchProRefusal };

export interface SwitchProInput {
  /** The plan the profile is on right now (entitlementsFor(tier, plan).plan). */
  plan: TierPlan;
  /** The live subscription, as offerEligible and the offer table read it. */
  offer: OfferState;
  /** Who bills it. This route is the Stripe (web) path; a store account may
   *  still switch — it is a plan change inside the store's group. */
  billingSource?: BillingSource | string | null;
  now?: Date;
  /** NEXT_PUBLIC_TIERS. Off: the kind is not part of the API at all. */
  tiersOn: boolean;
}

/**
 * May this request record the Pro switch? It asks the same table the cancel
 * screen renders (cancelOffersFor at reason "price"), so the screen and the
 * route can never disagree.
 */
export function switchProDecision(input: SwitchProInput): SwitchProDecision {
  if (!input.tiersOn) return { ok: false, error: 'not_available' };

  const eligible = offerEligible(input.offer, input.now ?? new Date());
  const offers = cancelOffersFor({
    plan: input.plan,
    reason: 'price',
    trialing: input.offer.status === 'trialing',
    billingSource: input.billingSource ?? 'stripe',
    eligible,
  });

  // 'switch_pro' is only in the list for a Plus user who is eligible.
  return offers.includes('switch_pro') ? { ok: true } : { ok: false, error: 'not_eligible' };
}

// ── Taking it, end to end (the route's switch_pro path) ─────────────
// A store-billed Plus plan has no Stripe subscription, so this path never asks
// for one: the route authenticates and reads the profile, then hands the facts
// here. The writes are the same two every other offer makes — the one atomic
// 12-month claim, then the event that records the offer taken.

export type SwitchProProfile = {
  access_tier: string | null;
  plan: string | null;
  billing_source: string | null;
  subscription_status: string | null;
  retention_offer_used_at: string | null;
  cancel_at_period_end: boolean | null;
  paused_until: string | null;
};

export type SwitchProResult =
  | { ok: true }
  | { ok: false; status: 400 | 409 | 500; error: 'bad_request' | 'not_eligible' | 'failed' };

export type SwitchProDeps = {
  tiersOn: boolean;
  profile: SwitchProProfile;
  now?: Date;
  /** The one atomic claim (profiles.retention_offer_used_at). */
  claimWindow: (now: Date) => Promise<'claimed' | 'not_eligible' | 'error'>;
  /** Append the cancel_events row. Only after a successful claim. */
  logOffer: () => Promise<void>;
};

/**
 * The live status the offer rules read. A store-billed profile is written by
 * the RevenueCat webhook, which sets `access_tier` (trialing / active /
 * past_due / canceled) and never `subscription_status` (that column is the
 * Stripe sync's). So a store profile's status is its tier; reading the Stripe
 * column there would see null, or a stale value from an old Stripe
 * subscription, and refuse every real Plus user.
 */
export function offerStatusFor(p: Pick<SwitchProProfile, 'access_tier' | 'billing_source' | 'subscription_status'>): string {
  const store = p.billing_source === 'app_store' || p.billing_source === 'play_store';
  if (store) return p.access_tier ?? 'canceled';
  return p.subscription_status ?? 'canceled';
}

/**
 * Record the Pro switch as the offer taken. Refusals match the screen's own
 * table (switchProDecision), so a stale client can never record an offer the
 * user was not offered; the claim then settles the race with a second request.
 */
export async function takeSwitchProOffer(deps: SwitchProDeps): Promise<SwitchProResult> {
  if (!deps.tiersOn) return { ok: false, status: 400, error: 'bad_request' };

  const p = deps.profile;
  const now = deps.now ?? new Date();
  const decision = switchProDecision({
    plan: entitlementsFor(p.access_tier, p.plan).plan,
    offer: {
      status: offerStatusFor(p),
      cancelAtPeriodEnd: Boolean(p.cancel_at_period_end),
      paused: Boolean(p.paused_until),
      retentionOfferUsedAt: p.retention_offer_used_at,
    },
    // The real source, never a fixed 'stripe'.
    billingSource: p.billing_source,
    now,
    tiersOn: deps.tiersOn,
  });
  if (!decision.ok) return { ok: false, status: 409, error: 'not_eligible' };

  const claim = await deps.claimWindow(now);
  if (claim === 'not_eligible') return { ok: false, status: 409, error: 'not_eligible' };
  if (claim === 'error') return { ok: false, status: 500, error: 'failed' };

  await deps.logOffer();
  return { ok: true };
}
