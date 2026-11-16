// Which plan may start a NEW bank connection (TIERS-SPEC.md).
//
// Only the two "new link" moments are gated: the create-mode Link token and the
// public-token exchange. Update mode (re-login for an item the caller already
// owns), sync, review, transactions, deposits, disconnect and the webhook are
// never gated — spec rule 4: a connected bank keeps working after a lapse.
//
// The decision is not re-derived here: isPlusPlan() (entitlementsFor) is the one
// place a plan is resolved, and Plus is the only plan with bank activity.
import { isPlusPlan } from '@/lib/entitlements';

export const PLAN_REQUIRED = 'plan_required';

/** Is a new bank link allowed for this (tier, plan)? `enforced` is the
 *  build-time tiers flag: off means today's behaviour, for everyone. */
export function newLinkAllowed(
  enforced: boolean,
  tier: string | null | undefined,
  plan: string | null | undefined,
): boolean {
  if (!enforced) return true;
  return isPlusPlan(tier, plan);
}
