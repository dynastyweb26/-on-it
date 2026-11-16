// Estimate → invoice conversion: the deposit columns the new invoice starts with.
// Pure so the rule is unit-tested. The deposit is carried over (type, value and a
// freshly derived amount) so the converted invoice is created already awaiting
// its deposit; none → the neutral 'none'.
import { toEstimateDeposit, type PublicModelInvoice } from './public-model';

export type ConvertedDepositColumns = {
  deposit_type: 'percentage' | 'fixed' | 'none';
  deposit_value: number | null;
  deposit_amount: number | null;
};

/** The two invoices columns that carry the skipped-photos note (migration
 *  20261116140000). */
export type AttachmentsSkippedColumns = {
  attachments_skipped: number;
  attachments_skipped_from: number | null;
};

/**
 * What to store on a freshly copied document about the photos the plan did not
 * copy. Null when there is nothing to say: the tiers flag is off (today's
 * conversion writes no such columns) or nothing was skipped (an untouched row
 * stays null, matching the migration's no-backfill rule).
 *
 * Pure: the flag is passed in, so both branches are tested without a database.
 * A count always wins over a missing source number — the note can still say
 * how many were left behind.
 */
export function attachmentsSkippedColumns(
  enforced: boolean,
  skipped: { count: number; sourceNumber: number | null | undefined },
): AttachmentsSkippedColumns | null {
  if (!enforced) return null;
  const count = Number.isFinite(skipped.count) && skipped.count > 0 ? Math.floor(skipped.count) : 0;
  if (count < 1) return null;
  const from = typeof skipped.sourceNumber === 'number'
    && Number.isInteger(skipped.sourceNumber)
    && skipped.sourceNumber > 0
    ? skipped.sourceNumber
    : null;
  return { attachments_skipped: count, attachments_skipped_from: from };
}

export function convertedDepositColumns(
  est: Pick<PublicModelInvoice, 'total' | 'deposit_type' | 'deposit_value' | 'deposit_amount'>,
): ConvertedDepositColumns {
  const d = toEstimateDeposit(est);
  if (!d) return { deposit_type: 'none', deposit_value: null, deposit_amount: null };
  const value = Number(est.deposit_value);
  return {
    deposit_type: est.deposit_type as 'percentage' | 'fixed',
    deposit_value: Number.isFinite(value) && value > 0 ? value : d.amount,
    deposit_amount: d.amount,
  };
}
