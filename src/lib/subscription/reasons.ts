// Cancel reasons (CANCEL-FLOW-SPEC.md §3). Pure and shared: the cancel screen
// renders these, the routes validate against them, and the DB check
// (cancel_events_reason_chk) holds the same keys.

export const CANCEL_REASONS = ['price', 'seasonal', 'feature', 'switching', 'other'] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];

export const isCancelReason = (v: unknown): v is CancelReason =>
  typeof v === 'string' && (CANCEL_REASONS as readonly string[]).includes(v);

/** Reasons whose free-text field is kept ("What's missing?" / "Something else"). */
export const REASONS_WITH_DETAIL: ReadonlySet<CancelReason> = new Set(['feature', 'other']);

export const DETAIL_MAX = 500;

/** The detail as stored: only for reasons that collect it, control
 *  characters removed, whitespace collapsed, capped at DETAIL_MAX, and null
 *  when nothing is left. */
export function cleanDetail(reason: CancelReason | null | undefined, detail: unknown): string | null {
  if (!reason || !REASONS_WITH_DETAIL.has(reason) || typeof detail !== 'string') return null;
  // Normalize Unicode compatibility forms (NFKC) and strip invisible format control characters
  // before stripping control characters and collapsing whitespace (SECURITY.md layer 6).
  const s = detail
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, DETAIL_MAX)
    .trim();
  return s || null;
}

/** Stripe's cancellation_details.feedback for a reason. */
export const STRIPE_FEEDBACK: Record<CancelReason, 'too_expensive' | 'unused' | 'missing_features' | 'switched_service' | 'other'> = {
  price: 'too_expensive',
  seasonal: 'unused',
  feature: 'missing_features',
  switching: 'switched_service',
  other: 'other',
};
