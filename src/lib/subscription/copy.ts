// Cancel-flow copy (CANCEL-FLOW-SPEC.md §1-3), in one place so the Plan
// screen and the cancel screen say the same thing. Provider-neutral: no
// Stripe words. Honest copy (spec rule 5): canceling never deletes data.

export const PRICE = '$9.99';
export const DISCOUNT_PRICE = '$4.99';

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

export const offerNotice = (kind: 'discount' | 'paused', pausedUntil: string | null | undefined): string =>
  kind === 'discount'
    ? 'Done. 50% off your next 2 months.'
    : fmtPlanDate(pausedUntil) ? `Paused until ${fmtPlanDate(pausedUntil)}.` : 'Paused.';
