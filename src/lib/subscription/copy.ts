// Cancel-flow copy (CANCEL-FLOW-SPEC.md §1-3), in one place so the Plan
// screen and the cancel screen say the same thing. Provider-neutral: no
// Stripe words. Honest copy (spec rule 5): canceling never deletes data.

export const PRICE = '$9.99';

/** "Oct 16, 2026", or null when the date is missing (callers drop the clause). */
export const fmtPlanDate = (d: string | null | undefined): string | null =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

/** "after that you're on the free plan (3 invoices and 5 expenses)." The
 *  numbers come from the same SQL limits the paywall uses; not monthly —
 *  the caps count from a fixed reset (PUNCH-LIST cancel-flow audit). */
export type FreeLimits = { invoices: number | null; expenses: number | null };

/** "the free plan (3 invoices and 5 expenses)", or "the free plan" when the
 *  limits aren't known (paywall off). */
export function freePlanLabel(limits: FreeLimits | null | undefined): string {
  const inv = limits?.invoices;
  const exp = limits?.expenses;
  return typeof inv === 'number' && typeof exp === 'number'
    ? `the free plan (${inv} invoices and ${exp} expenses)`
    : 'the free plan';
}

export function freePlanAfterLine(limits: FreeLimits | null | undefined): string {
  return `after that you’re on ${freePlanLabel(limits)}.`;
}

/** What ends with the plan, matching what the paywall actually gates. */
export function endsWithPlanLine(recapsLive: boolean): string {
  return recapsLive
    ? 'Your history stays. Unlimited invoices and expenses, PDF reports and recaps end with your plan.'
    : 'Your history stays. Unlimited invoices and expenses, and PDF reports, end with your plan.';
}

// Discount offer. No price is hard-coded: 50% of $9.99 is 499.5 cents and
// Stripe does the rounding, so the copy says "half price". The percentage is
// here so the cancel screen's button matches the offer (Stripe coupon:
// 50% off, repeating 2 months).
export const DISCOUNT_PERCENT = 50;
export const discountCta = `Take ${DISCOUNT_PERCENT}% off`;
export const discountTitle = 'Half price for your next 2 months';
export const discountLine = (trialing: boolean): string =>
  trialing
    ? `When your trial ends, half price for 2 months, then ${PRICE}/month.`
    : `Half price for your next 2 months, then ${PRICE}/month. Cancel anytime.`;

/** A pause starts when the paid period ends. Before then: full access, with
 *  the dates of both ends. Once it has started: the resume date. */
export function pausedLine(pausedFrom: string | null | undefined, pausedUntil: string | null | undefined, started: boolean): string {
  const from = fmtPlanDate(pausedFrom);
  const until = fmtPlanDate(pausedUntil);
  if (!started && from && until) return `Paused from ${from} until ${until}. You keep full access until ${from}.`;
  if (until) return `Paused until ${until}. Your plan picks back up then.`;
  return 'Paused. Your plan picks back up when you resume.';
}

/** The pause offer's line on the cancel screen, before it's taken. */
export function pauseOfferLine(pausedFrom: string | null | undefined, pausedUntil: string | null | undefined): string {
  const from = fmtPlanDate(pausedFrom);
  const until = fmtPlanDate(pausedUntil);
  return from && until
    ? `No charges while paused. You keep full access until ${from}, then your plan picks back up ${until}.`
    : 'No charges while paused. You keep full access until the end of this period.';
}

/** The notice Plan shows after an offer; the Plan line under it has the dates. */
export const offerNotice = (kind: 'discount' | 'paused'): string =>
  kind === 'discount' ? `Done. ${discountTitle}.` : 'Done. Your pause is set.';
