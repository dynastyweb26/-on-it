// ═══ A deposit → an invoice_payments row, the same way every time ═══
// Pure, so the route and the tests agree on the exact row: method 'bank',
// paid_source 'manual', and a deterministic idempotency key. Manual Record
// payment keys are random per tap (lib/payment-idempotency.ts); a deposit's is
// stable, so a double tap or a retried request adopts the first row instead of
// writing a second one.
//
// Nothing here decides whether a deposit MAY be recorded — that is
// ./payouts.depositLinkRefusal, checked before any write.
import { centsToAmount } from './match';

export const DEPOSIT_KEY_PREFIX = 'bank:';

/** `bank:<deposit id>` — stable for the deposit's whole life. */
export function depositPaymentKey(depositId: string): string {
  return `${DEPOSIT_KEY_PREFIX}${depositId}`;
}

export type DepositPaymentInput = {
  userId: string;
  invoiceId: string;
  depositId: string;
  /** Integer cents, abs(deposit). */
  amountCents: number;
  /** The bank's posted date (yyyy-mm-dd). */
  occurredOn: string;
};

/** The exact invoice_payments row the route inserts. */
export function depositPaymentRow(input: DepositPaymentInput) {
  return {
    invoice_id: input.invoiceId,
    user_id: input.userId,
    amount: centsToAmount(input.amountCents),
    method: 'bank' as const,
    paid_source: 'manual' as const,
    // Noon UTC on the bank's posted day: cash-basis income lands in the month
    // the money actually arrived, never on a timezone boundary.
    paid_at: `${input.occurredOn}T12:00:00.000Z`,
    note: 'Recorded from a bank deposit',
    idempotency_key: depositPaymentKey(input.depositId),
  };
}

/**
 * Would linking this ledger amount take the deposit over its own amount?
 * The database trigger is the backstop; this is the readable pre-check.
 */
export function wouldExceedDeposit(
  linkedCents: number,
  depositCents: number,
  addCents: number,
): boolean {
  if (![linkedCents, depositCents, addCents].every((n) => Number.isFinite(n))) return true;
  return linkedCents + addCents > depositCents;
}
