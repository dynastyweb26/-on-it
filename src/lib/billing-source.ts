// ═══ ON IT — who may write a profile's billing fields ═══
// Two billing systems write the same columns: Stripe (the web) and RevenueCat
// (the stores). billing_source records which one owns a profile, and this is the
// ONE rule that decides a write — enforced inside the UPDATE's WHERE by
// billingSourceOr() so it is atomic (see lib/billing-write.ts).
//
// A source may write when:
//   • nobody owns the profile yet (billing_source is null), or
//   • it already owns it, or
//   • the profile is not on a live tier (a lapsed row is fair game).
// One exception, deliberate: a store purchase always wins over a LIVE Stripe
// subscription — the user paid the store and must get access. That write is
// logged as double_billing so the Stripe side can be refunded.

export type BillingSource = 'stripe' | 'app_store' | 'play_store';

/** Tiers that mean "this profile is on a live subscription right now". */
export const LIVE_TIERS = ['trialing', 'active', 'past_due'] as const;

export function isLiveTier(tier: string | null | undefined): boolean {
  return tier === 'trialing' || tier === 'active' || tier === 'past_due';
}

/** Is this a store source (RevenueCat) rather than Stripe? */
export function isStoreSource(source: BillingSource): boolean {
  return source !== 'stripe';
}

/** The rule, in TS. billingSourceOr() below is the same rule in SQL. */
export function mayWriteBilling(
  writer: BillingSource,
  currentSource: string | null | undefined,
  tier: string | null | undefined,
): boolean {
  if (currentSource == null || currentSource === writer) return true;
  if (!isLiveTier(tier)) return true;
  // The store exception: it always outranks a live Stripe subscription.
  return isStoreSource(writer) && currentSource === 'stripe';
}

/** Would this write take a paying Stripe subscriber over to a store? */
export function isDoubleBilling(
  writer: BillingSource,
  currentSource: string | null | undefined,
  tier: string | null | undefined,
): boolean {
  return isStoreSource(writer) && currentSource === 'stripe' && isLiveTier(tier);
}

/**
 * The same rule as a PostgREST `or=` filter, for the UPDATE's WHERE. Multiple
 * .or() calls in supabase-js are ANDed, so this can sit beside the founder
 * guard.
 */
export function billingSourceOr(writer: BillingSource): string {
  const clauses = [
    'billing_source.is.null',
    `billing_source.eq.${writer}`,
    // A null or non-live tier is writable by either source.
    'access_tier.is.null',
    `access_tier.not.in.(${LIVE_TIERS.join(',')})`,
  ];
  if (isStoreSource(writer)) clauses.push('billing_source.eq.stripe');
  return clauses.join(',');
}
