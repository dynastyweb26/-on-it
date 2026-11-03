// ═══ The second-connection notice ═══
// Once a seller has both card payments (Stripe) and a bank connected, their
// card money arrives as one bank lump. Saying so once, before they see the
// deposit, is what stops it being counted twice. Pure rules; the component and
// the dismissal live in components/settings/PayoutLumpNotice.tsx.
export const LUMP_NOTICE_COPY =
  "Card payments pay out to your bank in one lump. We'll label those so they're never counted twice.";

import { isPaidTier } from './paywall';

/** Shown only when BOTH are connected; a dismissal is the caller's business. */
export function showLumpNotice(
  stripeAccountId: string | null | undefined,
  bankLast4: string | null | undefined,
): boolean {
  return Boolean(stripeAccountId && bankLast4);
}

/**
 * The popup is the paid hello: same two connections, and a paid tier read with
 * the app's one helper. The inline note is not gated — a free owner who has both
 * connected still needs to know a payout is not new income.
 */
export function showLumpPopup(
  accessTier: string | null | undefined,
  stripeAccountId: string | null | undefined,
  bankLast4: string | null | undefined,
): boolean {
  return showLumpNotice(stripeAccountId, bankLast4) && isPaidTier(accessTier);
}
