// ═══ Stripe payout detector (money in) ═══
// A Stripe payout is card money the seller already counted, arriving in their
// bank as one lump. It must never become a second ledger row.
//
// The only signal On It stores from Plaid is the descriptor: `name` and
// `merchant_name`. Both are checked, case-insensitively, for the whole word
// STRIPE — "STRIPE TRANSFER", "Stripe Payout", "STRIPE PAYMENTS" match;
// "Striped Shirt Co" and "STRIPES" do not. Pure: the sync reducer and the
// deposit route both call it, and neither trusts the client.
export const STRIPE_PAYOUT_NOTE =
  "Looks like a Stripe payout. Those pay out money already counted, so it's not new income.";

const STRIPE_WORD = /\bSTRIPE\b/;

/** True when any descriptor names Stripe. Empty/blank descriptors are false. */
export function isStripePayout(...descriptors: (string | null | undefined)[]): boolean {
  return descriptors.some(
    (value) => typeof value === 'string' && STRIPE_WORD.test(value.toUpperCase()),
  );
}

/** Why a deposit can never take a ledger row. */
export type DepositRefusal = 'stripe_payout' | 'removed' | null;

/**
 * Why a deposit can never take a ledger row, or null when it may.
 * Fail closed: the stored flag OR a fresh descriptor read refuses a payout,
 * and a deposit the bank removed refuses everything.
 */
export function depositLinkRefusal(deposit: {
  is_stripe_payout?: boolean | null;
  removed_at?: string | null;
  name?: string | null;
  merchant_name?: string | null;
}): DepositRefusal {
  if (deposit.is_stripe_payout || isStripePayout(deposit.name, deposit.merchant_name)) {
    return 'stripe_payout';
  }
  if (deposit.removed_at) return 'removed';
  return null;
}

/**
 * The link kind a "Not income" decision stores: a payout is recorded as
 * `stripe_payout` (not `not_income`) so the reason survives.
 */
export function notIncomeKind(deposit: {
  is_stripe_payout?: boolean | null;
  name?: string | null;
  merchant_name?: string | null;
}): 'stripe_payout' | 'not_income' {
  return deposit.is_stripe_payout || isStripePayout(deposit.name, deposit.merchant_name)
    ? 'stripe_payout'
    : 'not_income';
}
