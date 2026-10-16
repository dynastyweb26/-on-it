// Bank transfer (US ACH) details — shared validation for Settings (client)
// and /api/bank (server). The database re-checks the routing checksum and
// account format (20261015200000_bank_transfer.sql), so this is the friendly
// first line, not the only one.
import { z } from 'zod';

export const ROUTING_ERROR = "That routing number isn't valid. Double-check it.";
export const ACCOUNT_ERROR = 'Account numbers are 4 to 17 digits.';
export const ACCOUNT_MISMATCH_ERROR = "The account numbers don't match.";

/** ABA checksum: (3*(d1+d4+d7) + 7*(d2+d5+d8) + (d3+d6+d9)) % 10 === 0. */
export function abaRoutingValid(routing: string): boolean {
  if (!/^\d{9}$/.test(routing)) return false;
  const d = routing.split('').map(Number);
  return (3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])) % 10 === 0;
}

/** "••••4417" from the stored last four. */
export const maskAccount = (last4: string) => `••••${last4}`;

// Digits only: people paste "021 000 021" or "0210-00021".
const digits = (v: string) => v.replace(/[\s-]/g, '');

/**
 * Save payload. `account` / `accountConfirm` are omitted when the pro edits
 * other fields and keeps the stored account number.
 */
export const BankDetailsSchema = z
  .object({
    holderName: z.string().trim().min(1, 'Enter the account holder name.').max(100, 'Keep the name under 100 characters.'),
    bankName: z.string().trim().min(1, 'Enter the bank name.').max(100, 'Keep the bank name under 100 characters.'),
    routing: z.string().transform(digits).refine(abaRoutingValid, ROUTING_ERROR),
    account: z.string().transform(digits).refine((v) => /^\d{4,17}$/.test(v), ACCOUNT_ERROR).optional(),
    accountConfirm: z.string().transform(digits).optional(),
    accountType: z.enum(['checking', 'savings']),
    enabled: z.boolean(),
  })
  .refine((v) => v.account === undefined || v.account === v.accountConfirm, {
    message: ACCOUNT_MISMATCH_ERROR,
    path: ['accountConfirm'],
  });

export type BankDetails = z.infer<typeof BankDetailsSchema>;

/** First validation message, for a single inline error line. */
export function firstBankError(result: { success: false; error: z.ZodError }): string {
  return result.error.issues[0]?.message ?? 'Check the bank details.';
}
