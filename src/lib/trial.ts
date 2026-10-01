// Free-trial rules — one place for the length and who gets one.
//
// TRIAL_DAYS is what /api/checkout sends to Stripe (trial_period_days) and what
// every disclosure says ("14-day free trial, then $9.99/month, recurring").
// Keep the copy in PaywallModal, Settings, the trial reminder email and the
// Terms in step with it.
//
// One trial per customer: a profile that has ever had a trial or a
// subscription (the Stripe webhook writes trial_ends_at / subscription_status
// on every subscription event) gets none — re-subscribing after a cancel pays
// from day one. /api/checkout additionally asks Stripe for any earlier
// subscription on the customer, in case the webhook never recorded it.
export const TRIAL_DAYS = 14;

export function trialEligible(profile: {
  trial_ends_at?: string | null;
  subscription_status?: string | null;
} | null | undefined): boolean {
  return !profile?.trial_ends_at && !profile?.subscription_status;
}
