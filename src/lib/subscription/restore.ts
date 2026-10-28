// ═══ Restore purchases ═══
// The App Store requires a "Restore Purchases" affordance wherever a
// subscription can be bought, and Google Play expects the same. This module is
// that action — and, for now, only that action: no purchase is billed through a
// store yet. Web billing runs through Stripe Checkout (POST /api/checkout), and
// the wall's one gold CTA is the thing the native IAP phase re-points at the
// store.
//
// TODO(native IAP): replace the body with the store call —
//   • iOS: AppStore.sync() (or restoreCompletedTransactions), then read the
//     verified transaction's product id and original transaction id;
//   • Android: queryPurchasesAsync for the subscription product;
// then POST the resulting receipt to an /api/iap/verify route so the SERVER
// (never this module, never the browser) decides the tier — access_grants (the
// same path founder and referral codes use) or the profile's subscription
// fields. Until then report `unavailable` and let the wall say so plainly
// rather than pretend something was restored.
export type RestoreOutcome = 'restored' | 'nothing' | 'unavailable';

/** What the wall shows when there is no store billing to restore from. */
export const RESTORE_UNAVAILABLE =
  'Nothing to restore yet — subscriptions aren’t billed through the app stores.';

export async function restorePurchases(): Promise<RestoreOutcome> {
  return 'unavailable';
}
