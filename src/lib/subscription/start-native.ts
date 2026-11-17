// ═══ The native purchase seam (not wired yet) ═══
// Not imported anywhere: the native wrap fills this in, behind the same
// `Purchases` interface the web adapter implements, so no screen changes when
// the store takes over. Todd(native wrap):
//   • start / upgrade / switchToPro  → `purchasePackage` from
//     @revenuecat/purchases-capacitor for the offering's Pro or Plus package
//     (iOS: a Plus purchase from Pro in the same group is an immediate
//     prorated upgrade, Pro from Plus waits for renewal; Android: prorated
//     replacement for the upgrade, deferred for the downgrade).
//   • keepPlus                       → the same call with the Plus package
//     (a lower product is a no-op on both stores; recancel the pending change
//     through the store/RevenueCat and re-sync the profile).
//   • restore                        → `restorePurchases`, then the confirm wait.
//   • manage                         → RevenueCat's management URL (the store's
//     own manage-subscription page).
//   • after ANY store success        → lib/subscription/confirm: poll
//     /api/access until profiles.plan matches, `slow` at 20s, retry re-asks.
//   • `cancelled`                    → the store sheet was dismissed.
//
// Until then every action reports `unavailable` and charges nothing.
import type { PurchaseOutcome, Purchases } from './start';

/** What the wrap must supply. Nothing here touches the RevenueCat SDK yet. */
export type NativePurchaseDeps = {
  /** Open the store sheet for one plan. 'cancelled' = the user backed out. */
  purchasePackage: (plan: 'pro' | 'plus') => Promise<'purchased' | 'cancelled'>;
  /** The server-confirm wait (lib/subscription/confirm), already wired. */
  confirm: (plan: 'pro' | 'plus') => Promise<PurchaseOutcome>;
  /** AppStore.sync / queryPurchasesAsync. */
  restorePurchases: () => Promise<'restored' | 'nothing'>;
  /** RevenueCat's management URL for this subscriber, or null. */
  manageUrl: () => Promise<string | null>;
};

const NOT_WIRED = 'Store purchases aren’t wired up in this build. Nothing was charged.';

const notWired = (): Promise<PurchaseOutcome> =>
  Promise.resolve({ status: 'failed', cause: 'unavailable', message: NOT_WIRED });

/**
 * The native adapter. Its dependencies are declared so the wrap knows exactly
 * what to supply; the body is the "not implemented" seam on purpose.
 */
export function createNativePurchases(_deps: NativePurchaseDeps): Purchases {
  return {
    source: 'native',
    start: notWired,
    upgrade: notWired,
    switchToPro: notWired,
    keepPlus: notWired,
    restore: notWired,
    manage: notWired,
  };
}
