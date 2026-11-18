// ═══ Funnel events for PostHog ═══
// The only named events the app sends. Each one carries a fixed set of
// enumerated properties: never an amount, a client, an item or any typed
// text (Privacy Policy, "Analytics and crash reporting"). Before PostHog
// starts (no key, a public page) every call is a no-op.
//
// Funnel: onboarding_completed → document_created → paywall_viewed
//         → checkout_started → subscription_started
import posthog from 'posthog-js';

export type FunnelEvents = {
  onboarding_completed: Record<string, never>;
  document_created: { kind: 'invoice' | 'estimate'; source: 'chat' | 'estimate' };
  expense_recorded: { source: 'chat' | 'sheet' };
  paywall_viewed: { variant: string; entry: string };
  checkout_started: { plan: 'pro' | 'plus'; from: 'paywall' | 'lock_sheet' };
  subscription_started: Record<string, never>;
};

/** Paywall variant / entry names are the app's own enum strings; anything
 *  longer or with spaces is not one of them and is dropped. */
export const safeLabel = (s: string | null | undefined): string =>
  typeof s === 'string' && /^[a-z0-9_-]{1,40}$/i.test(s) ? s : 'other';

export function track<E extends keyof FunnelEvents>(event: E, props: FunnelEvents[E]): void {
  try {
    if (!posthog.__loaded) return;
    posthog.capture(event, props as Record<string, unknown>);
  } catch {
    /* analytics never breaks the app */
  }
}
