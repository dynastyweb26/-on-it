// The public state of an estimate. Stored status is never recalculated; this is
// the one place that turns the stored facts into what the client page shows.
//
// approved  = approved_at is set (a signed copy stays viewable forever)
// expired   = the business-local day after valid_until has begun
// pending   = sent, unsigned, not revoked, not converted, not expired
// unavailable = missing/deleted/draft/revoked/converted-without-signature
import type { EstimateState } from './types';
import {
  calendarDaysBetween,
  endOfDayInstant,
  resolveTimeZone,
  todayInTimeZone,
} from './dates';

export type EstimateStateInput = {
  status: string | null;
  deletedAt?: string | null;
  approvedAt?: string | null;
  revokedAt?: string | null;
  validUntil?: string | null;
  /** A non-deleted invoice exists with converted_from = this estimate id. */
  converted?: boolean;
};

export function estimateState(
  input: EstimateStateInput,
  now: Date,
  tz?: string | null,
): EstimateState {
  if (input.deletedAt) return 'unavailable';
  // Approved wins over expiry: a signed copy is viewable forever.
  if (input.approvedAt) return 'approved';
  if (input.revokedAt) return 'unavailable';
  if (input.status !== 'sent') return 'unavailable';
  if (input.converted) return 'unavailable';
  if (input.validUntil) {
    const expires = endOfDayInstant(input.validUntil, resolveTimeZone(tz));
    if (expires && now.getTime() >= expires.getTime()) return 'expired';
  }
  return 'pending';
}

/**
 * Whole calendar days left, business-local. 0 means "expires today".
 * null when there is no expiry (legacy rows) or the estimate is approved.
 */
export function daysRemaining(
  input: EstimateStateInput,
  now: Date,
  tz?: string | null,
): number | null {
  if (input.approvedAt) return null;
  if (!input.validUntil) return null;
  const state = estimateState(input, now, tz);
  if (state === 'unavailable') return null;
  if (state === 'expired') return 0;
  const days = calendarDaysBetween(
    todayInTimeZone(now, tz),
    input.validUntil,
  );
  return days === null ? null : Math.max(0, days);
}
