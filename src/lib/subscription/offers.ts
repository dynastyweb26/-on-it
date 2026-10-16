// Retention offer rules (CANCEL-FLOW-SPEC.md §3, D3, D4). Pure and shared:
// the cancel-summary endpoint reports them to the screen, and every offer
// route re-checks them server-side against the live subscription — the
// client's view is never trusted.
import type { CancelReason } from './reasons';

export type OfferKind = 'discount' | 'pause';

/** One retention offer per user per 12 months (D4). */
export const OFFER_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;

export const PAUSE_MONTHS = [1, 2, 3] as const;
export type PauseMonths = (typeof PAUSE_MONTHS)[number];
export const isPauseMonths = (v: unknown): v is PauseMonths =>
  typeof v === 'number' && (PAUSE_MONTHS as readonly number[]).includes(v);

export type OfferState = {
  status: string;                       // live subscription status
  cancelAtPeriodEnd: boolean;
  paused: boolean;
  retentionOfferUsedAt: string | null;
};

/** May this user be shown (and take) a retention offer at all?
 *  Only trialing / active (never past_due), not already canceling or
 *  paused, and no offer taken in the last 12 months. */
export function offerEligible(s: OfferState, now: Date = new Date()): boolean {
  if (s.status !== 'trialing' && s.status !== 'active') return false;
  if (s.cancelAtPeriodEnd || s.paused) return false;
  if (s.retentionOfferUsedAt) {
    const used = Date.parse(s.retentionOfferUsedAt);
    if (Number.isFinite(used) && now.getTime() - used < OFFER_WINDOW_MS) return false;
  }
  return true;
}

/** The single offer for a reason, or null. A pause needs a paid period to
 *  pause, so it is never offered during a trial. */
export function offerFor(reason: CancelReason | null | undefined, status: string, eligible: boolean): OfferKind | null {
  if (!eligible || !reason) return null;
  if (reason === 'price') return 'discount';
  if (reason === 'seasonal') return status === 'trialing' ? null : 'pause';
  return null;
}

/** Is this kind allowed for this subscription right now? (Route check.) */
export function offerAllowed(kind: OfferKind, s: OfferState, now: Date = new Date()): boolean {
  const eligible = offerEligible(s, now);
  return offerFor(kind === 'discount' ? 'price' : 'seasonal', s.status, eligible) === kind;
}

/** `months` calendar months after `from` (UTC), on day `day` (default:
 *  from's own day) clamped to the month's last day — Stripe's calendar math
 *  for both a discount's end and a billing anchor's renewals (anchor on the
 *  31st renews Feb 28/29, then Mar 31). Time of day is kept from `from`. */
export function addMonthsClamped(from: Date, months: number, day: number = from.getUTCDate()): Date {
  const d = new Date(from.getTime());
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

/** The pause end: N calendar months from `from` (UTC), clamped to the
 *  month's last day so Jan 31 + 1 month is Feb 28/29, not Mar 3. */
export function pauseResumesAt(months: PauseMonths, from: Date = new Date()): Date {
  return addMonthsClamped(from, months);
}

// ── Retention coupon choice ──────────────────────────────────────
// A repeating coupon ends exactly N calendar months after it's applied
// (verified on a Stripe test clock: applied Oct 17 00:00 → end Dec 17
// 00:00). "Half price for your next 2 months" means the next TWO renewals.
// Applied right after a renewal, or on an anchor clamped by a short month,
// the second renewal lands at or past the 2-month end and would be billed
// in full. Then a 3-month coupon is used instead (founder 2026-10-16).

export type RetentionCoupon = 'x2' | 'x3';

/** Margin the second renewal must clear before the 2-month end. */
export const COUPON_MARGIN_MS = 24 * 60 * 60 * 1000;

/** The renewal after `periodEnd` on a monthly anchor: next month, on the
 *  anchor's day of month (clamped), at the anchor's time of day. */
export function nextRenewal(periodEnd: Date, anchor: Date): Date {
  const d = addMonthsClamped(periodEnd, 1, anchor.getUTCDate());
  d.setUTCHours(anchor.getUTCHours(), anchor.getUTCMinutes(), anchor.getUTCSeconds(), 0);
  return d;
}

/** x2 when the second upcoming renewal (period end + 1 billing month) is
 *  more than 24h before now + 2 months; otherwise x3. */
export function pickRetentionCoupon(input: { now: Date; periodEnd: Date; anchor: Date }): RetentionCoupon {
  const second = nextRenewal(input.periodEnd, input.anchor);
  const x2Ends = addMonthsClamped(input.now, 2);
  return second.getTime() < x2Ends.getTime() - COUPON_MARGIN_MS ? 'x2' : 'x3';
}
