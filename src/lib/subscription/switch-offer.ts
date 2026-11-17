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
import type { TierPlan } from '../entitlements';

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
