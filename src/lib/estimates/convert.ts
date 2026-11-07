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
