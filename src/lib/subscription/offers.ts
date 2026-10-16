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

/** The pause end: N calendar months from now (UTC), clamped to the month's
 *  last day so Jan 31 + 1 month is Feb 28/29, not Mar 3. */
export function pauseResumesAt(months: PauseMonths, now: Date = new Date()): Date {
  const d = new Date(now.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}
