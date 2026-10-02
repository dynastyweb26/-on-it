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

// The trial reminder email goes out once trial_ends_at is within this many
// days (/api/trial-reminders, daily cron). The paywall timeline's "We'll
// remind you" date is end − TRIAL_REMINDER_DAYS, so the two can't drift.
export const TRIAL_REMINDER_DAYS = 3;

/** The paywall timeline dates for a trial started now, in the viewer's own
 *  timezone (calendar-day arithmetic, so a DST change can't shift a date). */
export function trialDates(now: Date = new Date()): { end: Date; remind: Date } {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + TRIAL_DAYS);
  const remind = new Date(end.getFullYear(), end.getMonth(), end.getDate() - TRIAL_REMINDER_DAYS);
  return { end, remind };
}
