// ═══ ON IT — Settings › Plan, as data (design/tiers 06) ═══
// The plan card shows five facts: the plan, its price, when it renews (or when
// the trial ends), a pending change to/at, and who bills it — plus the manage
// link and the founder case ("no actions, no manage link"). Every one of them
// is decided HERE, so the screen renders and computes nothing.
//
// Pure: no DB, no React, no copy. The price comes from lib/plan-catalog (the
// one source) and the plan from lib/entitlements (the one truth).
import { PLAN_NAMES, type PlanLabel, type TierPlan } from './entitlements';
import { PLAN_MONTHLY_CENTS, manageSubscriptionLink, type ManageSubscription, type PaidPlan } from './plan-catalog';
import { isLiveTier } from './billing-source';
import { TRIAL_REMINDER_DAYS } from './trial';

export interface PlanCard {
  /** The plan the account is on right now (free when nothing is live). */
  plan: TierPlan;
  /** The name beside the card's title: Free, Pro, Plus, or Founder. */
  name: PlanLabel;
  founder: boolean;
  /** The monthly price from the catalog, in cents; null on Free and Founder. */
  priceCents: number | null;
  /** When the trial ends (trialing only), else null. */
  trialEndsAt: string | null;
  /** When the trial reminder goes out: trial end minus TRIAL_REMINDER_DAYS, the
   *  same constant the reminder email cron uses, so the card can't promise a
   *  different day than the email arrives. Null outside a trial. */
  trialReminderAt: string | null;
  /** When the paid period renews, else null. */
  renewalAt: string | null;
  /** A downgrade waiting for renewal ("Plus until …, then Pro"), else null. */
  pendingChangeTo: PaidPlan | null;
  pendingChangeAt: string | null;
  /** Which system bills this profile. Null on a Stripe-era profile. */
  billingSource: string | null;
  /** Where "Manage subscription" goes; null for a founder (no manage link). */
  manage: ManageSubscription | null;
  /** The card's actions, decided here so the screen only renders them. */
  canUpgradeToPlus: boolean;
  canSwitchToPro: boolean;
  canKeepPlus: boolean;
  canRestore: boolean;
}

export interface PlanCardInput {
  /** profiles.access_tier (raw). */
  tier: string | null | undefined;
  /** The plan /api/access already resolved (entitlementsFor().plan). */
  plan: TierPlan;
  billingSource?: string | null;
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
  planChangeTo?: string | null;
  planChangeAt?: string | null;
}

const isPaidPlan = (v: string | null | undefined): v is PaidPlan => v === 'pro' || v === 'plus';

/**
 * The card's facts for one profile. A founder is Plus and free forever: no
 * price, no manage link, no actions. A pending change is only shown while the
 * subscription is live (once it lands, the webhook has moved the plan).
 */
export function planCardFor(input: PlanCardInput): PlanCard {
  const founder = input.tier === 'founder';
  const live = isLiveTier(input.tier);
  const plan: TierPlan = founder ? 'plus' : live ? input.plan : 'free';
  const pendingChangeTo = live && !founder && isPaidPlan(input.planChangeTo) ? input.planChangeTo : null;
  const pendingChangeAt = pendingChangeTo ? input.planChangeAt ?? null : null;
  const paid = live && !founder && isPaidPlan(plan);

  const trialing = live && input.tier === 'trialing';
  const trialEndsAt = trialing ? input.trialEndsAt ?? input.currentPeriodEnd ?? null : null;
  const trialEndMs = trialEndsAt ? Date.parse(trialEndsAt) : NaN;
  const trialReminderAt = Number.isFinite(trialEndMs)
    ? new Date(trialEndMs - TRIAL_REMINDER_DAYS * 24 * 60 * 60 * 1000).toISOString()
    : null;

  return {
    plan,
    name: founder ? 'Founder' : PLAN_NAMES[plan],
    founder,
    priceCents: paid ? PLAN_MONTHLY_CENTS[plan] : null,
    trialEndsAt,
    trialReminderAt,
    renewalAt: live ? input.currentPeriodEnd ?? null : null,
    pendingChangeTo,
    pendingChangeAt,
    billingSource: input.billingSource ?? null,
    manage: live && !founder ? manageSubscriptionLink(input.billingSource) : null,
    // A pending downgrade is undone with "Keep Plus", so the upgrade is not
    // offered beside it (board 06C).
    canUpgradeToPlus: paid && plan === 'pro' && pendingChangeTo === null,
    // Not during a trial: design/tiers 06 (6C) draws the trial card with no
    // action. The store's manage page is still there for a change of mind.
    canSwitchToPro: paid && plan === 'plus' && pendingChangeTo === null && !trialing,
    canKeepPlus: paid && plan === 'plus' && pendingChangeTo === 'pro',
    canRestore: !founder,
  };
}
