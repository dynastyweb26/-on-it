// The four store products the founder will create, and the plan each one is.
//
// This map is used for ONE thing: reading a scheduled product change (item 4).
// The CURRENT plan is never decided from a product — RevenueCat's entitlements
// decide that (`pro`, and `plus` which also unlocks `pro`), so a product rename
// or a new store configuration can't silently move a customer's plan.
//
// Google Play product ids carry a base-plan suffix in webhook payloads. The
// docs are explicit: "For Google Play products set up in RevenueCat after
// February 2023, this identifier has the format `<subscription_id>:<base_plan_id>`"
// (and the subscriber object keys follow the same shape). So match on the part
// before ':' — `onit_pro_monthly:p1m` is `onit_pro_monthly`.
export type StorePlan = 'pro' | 'plus';

export const PRODUCT_PLANS: Readonly<Record<string, StorePlan>> = {
  onit_pro_monthly: 'pro',
  onit_plus_monthly: 'plus',
};

/** The documented product part of an id: everything before a Play base plan. */
export function baseProductId(productId: string | null | undefined): string {
  return String(productId ?? '').trim().split(':')[0];
}

/** The plan a product id names, or null when it is not one of ours. */
export function planForProduct(productId: string | null | undefined): StorePlan | null {
  const base = baseProductId(productId);
  return Object.prototype.hasOwnProperty.call(PRODUCT_PLANS, base) ? PRODUCT_PLANS[base] : null;
}

/** Plan order: a change to a LOWER plan waits for renewal, anything else does
 *  not need a pending change. */
export function planRank(plan: StorePlan): number {
  return plan === 'plus' ? 2 : 1;
}
