// ═══ Stripe payouts (money in) ═══
// A Stripe payout is card money the seller already counted, arriving in their
// bank as one lump. It must never become a second ledger row.
//
// The only signal On It stores from Plaid is the descriptor: `name` and
// `merchant_name`. Both are checked, case-insensitively, for the whole word
// STRIPE — "STRIPE TRANSFER", "Stripe Payout", "STRIPE PAYMENTS" match;
// "Striped Shirt Co" and "STRIPES" do not. Pure: the sync reducer and the
// deposit route both call it, and neither trusts the client.
//
// THERE IS NO SURE MATCH YET, ON PURPOSE.
// A sure match needs something that proves the deposit IS a payout: a stored
// payout record (id and amount) or a Stripe API read. On It holds neither — no
// stripe_payouts table, no payout feed — so a descriptor is all we have, and a
// descriptor is a guess. Guessing here errs toward silently filing real money
// away, so this module does not guess:
//
//   • every STRIPE deposit goes to To review with the caution note;
//   • the only income decision offered is "Already recorded", which claims the
//     card payments the lump is made of — they are already in the ledger;
//   • recording a NEW payment is refused, so a payout can never become income.
//
// When a verified payout record exists, the sure branch comes back here and
// `bank_deposit_links.kind = 'stripe_payout'` (kept in the check on purpose)
// becomes the state a sure match is stored as. Nothing writes it today.
//
// Stored kind for a non-income decision is therefore 'ignored' ("Don't add").
import { centsToAmount } from './match';

/** Shown on Ignored for a row stored as stripe_payout, when that state returns. */
export const STRIPE_PAYOUT_NOTE =
  "Looks like a Stripe payout. Those pay out money already counted, so it's not new income.";

/** Shown on every STRIPE descriptor in To review. Names the one safe answer. */
export const STRIPE_PAYOUT_CAUTION =
  "This might be a Stripe payout. If it is, choose An existing payment so the card payments inside aren't counted twice.";

const STRIPE_WORD = /\bSTRIPE\b/;

/** True when any descriptor names Stripe. Empty/blank descriptors are false. */
export function isStripePayout(...descriptors: (string | null | undefined)[]): boolean {
  return descriptors.some(
    (value) => typeof value === 'string' && STRIPE_WORD.test(value.toUpperCase()),
  );
}

/**
 * How sure we are that this deposit is a Stripe payout.
 *
 *   not_stripe  the descriptors do not name Stripe. An ordinary deposit.
 *   ambiguous   the descriptors name Stripe and nothing confirms it. To review,
 *               with the caution note. Never income.
 *
 * There is deliberately no 'sure': see the note at the top. Adding one requires
 * a stored payout record, which this round does not create.
 */
export type StripeVerdict = 'not_stripe' | 'ambiguous';

export function stripePayoutVerdict(deposit: {
  name?: string | null;
  merchant_name?: string | null;
  is_stripe_payout?: boolean | null;
}): StripeVerdict {
  const named = deposit.is_stripe_payout === true
    || isStripePayout(deposit.name, deposit.merchant_name);
  return named ? 'ambiguous' : 'not_stripe';
}

/** The short note above the buttons, or null when there is nothing to say. */
export function payoutNote(verdict: StripeVerdict): string | null {
  return verdict === 'ambiguous' ? STRIPE_PAYOUT_CAUTION : null;
}

export type DepositRefusal = 'stripe_payout' | 'removed' | null;

/**
 * Why a deposit can never take a NEW ledger row for this action, or null.
 *
 *   record   refused for a STRIPE descriptor: a new payment from a lump of card
 *            money would count the same money twice, and if the descriptor is
 *            right it would be income from a payout.
 *   already  allowed — the owner is claiming the card payments the lump is made
 *            of, which is exactly the right answer.
 *
 * A deposit the bank removed refuses everything: nothing here reverses a ledger.
 */
export function depositLinkRefusal(
  deposit: { removed_at?: string | null },
  verdict: StripeVerdict,
  action: 'record' | 'already',
): DepositRefusal {
  if (verdict === 'ambiguous' && action === 'record') return 'stripe_payout';
  if (deposit.removed_at) return 'removed';
  return null;
}

/** Render integer cents the way the deposits route writes an other_income row. */
export function centsToIncomeAmount(cents: number): string {
  return centsToAmount(cents);
}
