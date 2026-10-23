// Owner-facing estimate detail: the stored row turned into the one state, the
// labels and the numbers the owner screen shows. Pure and testable — the
// component passes the row, the clock and the business timezone; nothing here
// touches Supabase or the network.
//
// The public page has its own state rule (state.ts) with one important
// difference: a draft renders as `unavailable` there, while the owner needs to
// see and send it. Approved still wins over everything, matching the DB.
import {
  addDaysToDateString,
  calendarDaysBetween,
  endOfDayInstant,
  todayInTimeZone,
} from './dates';

export type OwnerEstimateState =
  | 'draft'
  | 'sent'
  | 'expired'
  | 'approved'
  | 'converted'
  | 'revoked'
  | 'unavailable';

export type OwnerStateInput = {
  status: string | null;
  approvedAt?: string | null;
  revokedAt?: string | null;
  validUntil?: string | null;
  /** A non-deleted invoice exists with converted_from = this estimate. */
  converted?: boolean;
  deletedAt?: string | null;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-11-18" → "Nov 18". Date-only strings stay calendar dates (never
 *  shifted by the viewer's UTC offset). */
export function shortDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return null;
  return `${MONTHS[month - 1]} ${day}`;
}

export function ownerEstimateState(
  input: OwnerStateInput,
  now: Date,
  tz?: string | null,
): OwnerEstimateState {
  if (input.deletedAt) return 'unavailable';
  // A signed copy stays viewable/approved forever, and beats a later conversion.
  if (input.approvedAt) return 'approved';
  if (input.converted) return 'converted';
  if (input.revokedAt) return 'revoked';
  if (input.status == null || input.status === 'draft') return 'draft';
  if (input.status !== 'sent') return 'unavailable';
  if (input.validUntil) {
    const expires = endOfDayInstant(input.validUntil, tz);
    if (expires && now.getTime() >= expires.getTime()) return 'expired';
  }
  return 'sent';
}

/** Content edits are allowed until the estimate is approved or converted. The
 *  DB guard (guard_locked_estimate_edits) enforces the same window. */
export function isOwnerEditable(state: OwnerEstimateState): boolean {
  return state === 'draft' || state === 'sent' || state === 'expired';
}

/** What the estimate link can do in this state. */
export function isLinkLive(state: OwnerEstimateState): boolean {
  return state === 'sent' || state === 'expired';
}

/** E-0017. Old Q-#### rows show the same digits under the new prefix. */
export function estimateNumber(n: number): string {
  return `E-${String(n).padStart(4, '0')}`;
}

/** Validity line beside the status chip. Null when there is nothing to say
 *  (none set, approved, converted or revoked). */
export function validityLabel(
  state: OwnerEstimateState,
  validUntil: string | null | undefined,
): string | null {
  if (!validUntil) return null;
  if (state === 'approved' || state === 'converted' || state === 'revoked') return null;
  const date = shortDate(validUntil);
  if (!date) return null;
  return state === 'expired' ? `Expired ${date}` : `Valid until ${date}`;
}

/** The signed card's method row. */
export function signedMethodLabel(type: 'draw' | 'type'): string {
  return type === 'draw' ? 'Drawn, from estimate link' : 'Typed, from estimate link';
}

/** "Oct 22, 2026 · 10:42 PM" in the business timezone. */
export function signedStamp(iso: string, tz?: string | null): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz?.trim() || undefined,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
  return parts.replace(/,\s(\d{1,2}:\d{2}\s[AP]M)$/, ' · $1');
}

/** "Oct 22" for the subtitle. */
export function sentOrApprovedDate(iso: string, tz?: string | null): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz?.trim() || undefined,
    month: 'short',
    day: 'numeric',
  }).format(d);
}

/** First name for the send toast ("Estimate sent to Jordan"). */
export function firstName(name: string | null | undefined): string {
  const first = (name ?? '').trim().split(/\s+/)[0] ?? '';
  return first || 'your client';
}

/**
 * Extend validity by 30 days from the later of today and the current expiry.
 * An already-expired estimate moves 30 days past TODAY, so extending it always
 * yields a usable link; one that still has 20 days left gets 30 more from its
 * current end date.
 */
export function extendValidity(
  validUntil: string | null | undefined,
  now: Date,
  tz?: string | null,
): string {
  const today = todayInTimeZone(now, tz);
  const base = validUntil && (calendarDaysBetween(today, validUntil) ?? -1) >= 0
    ? validUntil
    : today;
  return addDaysToDateString(base, 30);
}

/**
 * Line-item edits keep the AI's original wording the first time a line's
 * description changes — the same training-signal rule as the invoice editor.
 * Pure so the merge can be tested without a database.
 */
export function mergeLineItemEdits<T extends { description: string; original_description?: string | null }>(
  previous: readonly T[],
  next: readonly T[],
): T[] {
  return next.map((item, i) => {
    const before = previous[i];
    if (before && item.description !== before.description && !before.original_description) {
      return { ...item, original_description: before.description };
    }
    return item;
  });
}

/** "1 item" / "N items". */
export function itemCountLabel(n: number): string {
  return `${n} ${n === 1 ? 'item' : 'items'}`;
}

/** Parse a stored line item into the two-line shape the owner list shows. */
export function lineItemMeta(item: { qty?: unknown; unit?: unknown; unit_price?: unknown }): string {
  const qty = Number(item.qty ?? 0);
  const unit = typeof item.unit === 'string' && item.unit.trim() ? item.unit.trim() : 'each';
  const price = Number(item.unit_price ?? 0);
  return `${Number.isFinite(qty) ? qty : 0} ${unit} × ${
    Number.isFinite(price)
      ? price.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
      : '$—'
  }`;
}
