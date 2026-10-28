// ═══ Subscription purchase switch ═══
// STRIPE_SUBSCRIPTIONS_ENABLED (default off). While the purchase path moves into
// the app (Apple IAP), the Stripe SUBSCRIPTION checkout is switched off per
// deployment. The code stays: POST /api/checkout is the only route gated, and
// everything that touches an EXISTING subscription (cancel, resume, the billing
// portal), the webhook, the trial-reminder cron, founder codes and referral
// grants keep working exactly as they did. Stripe Connect and the pay-page card
// payments are a different path and are not involved.
//
// subscriptionsEnabled() is SERVER-ONLY in practice: the value is not
// NEXT_PUBLIC, so a browser bundle would read it as undefined (and therefore
// "off"). Client surfaces learn the switch from GET /api/access instead, which
// reports the same function's answer.
// The 503 body of POST /api/checkout only. No screen renders this: with the
// switch off the paywall and Settings' Plan card show no CTA and no notice, so
// there is nothing for a customer to read here.
export const SUBSCRIPTIONS_OFF_MESSAGE =
  'Subscriptions aren’t available here yet — they’re coming to the On It app. Nothing to pay today.';

export function subscriptionsEnabled(): boolean {
  return process.env.STRIPE_SUBSCRIPTIONS_ENABLED?.trim() === 'true';
}
