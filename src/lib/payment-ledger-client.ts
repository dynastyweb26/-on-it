// One construction of the ledger IO, shared by the online record-payment path
// and the offline queue's retry, so both write through exactly the same
// (user_id, idempotency_key) rule.
import type { createClient } from '@/lib/supabase/client';
import type { PaymentLedgerIO, PaymentLedgerRow, PaymentRowInput } from '@/lib/payment-idempotency';

type BrowserClient = ReturnType<typeof createClient>;

/**
 * The partial unique index that makes one submission one row. It is the only
 * conflict a repeat may be forgiven for: (user_id, idempotency_key) where the
 * key is not null.
 */
export const PAYMENT_IDEMPOTENCY_CONSTRAINT = 'invoice_payments_user_idempotency_key_uidx';

interface LedgerErrorish {
  status?: number | string | null;
  code?: string | number | null;
  message?: string | null;
  details?: string | null;
}

/**
 * True only for a repeat of the same submission: Postgres 23505 raised by the
 * idempotency index. The constraint NAME decides, because 23505 alone also
 * covers the primary key and the Stripe columns, which are never a safe repeat.
 */
export function isIdempotencyConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as LedgerErrorish;
  if (String(e.code ?? '') !== '23505') return false;
  return `${e.message ?? ''} ${e.details ?? ''}`.includes(PAYMENT_IDEMPOTENCY_CONSTRAINT);
}

/** A repeat that would record different money under an already-spent key. */
export function isDifferentPayment(existing: PaymentLedgerRow, row: PaymentRowInput): boolean {
  return existing.invoice_id !== row.invoice_id || Number(existing.amount) !== Number(row.amount);
}

/** Our fault, not the user's field: classified as "our end", never as bad input. */
function ledgerFault(code: string, message: string): LedgerErrorish {
  return { status: 500, code, message };
}

export function ledgerFrom(supabase: BrowserClient): PaymentLedgerIO {
  const findByKey: PaymentLedgerIO['findByKey'] = async (userId, key) => {
    const { data, error } = await supabase
      .from('invoice_payments')
      .select('*')
      .eq('user_id', userId)
      .eq('idempotency_key', key)
      .maybeSingle();
    if (error) {
      console.error('payment read-back failed', error);
      return null;
    }
    return (data as PaymentLedgerRow | null) ?? null;
  };

  return {
    insertOnce: async (row) => {
      // A plain insert, never an upsert: PostgREST can only build ON CONFLICT
      // for a FULL unique constraint, and this rule is a PARTIAL index (key is
      // not null), so `onConflict: 'user_id,idempotency_key'` is rejected with
      // "there is no unique or exclusion constraint matching the ON CONFLICT
      // specification". A repeat arrives here as 23505 on that index instead.
      const { error } = await supabase.from('invoice_payments').insert(row);
      if (!error) return { error: null };
      if (!isIdempotencyConflict(error)) return { error };

      // The key is already spent. It is this submission only if the row it
      // produced is the same payment — same invoice, same amount.
      const existing = await findByKey(row.user_id, row.idempotency_key);
      if (!existing) {
        // Recorded, but not readable for this key: never report success on a
        // reason we cannot see, and never blame the user for it.
        return {
          error: ledgerFault('PAYMENT_READBACK_MISSING', 'payment exists for key but could not be read back'),
          fatal: true,
        };
      }
      if (isDifferentPayment(existing, row)) {
        return {
          error: ledgerFault('PAYMENT_KEY_REUSED', 'idempotency key already recorded a different payment'),
          fatal: true,
        };
      }
      return { error: null };
    },
    findByKey,
  };
}
