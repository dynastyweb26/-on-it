// One construction of the ledger IO, shared by the online record-payment path
// and the offline queue's retry, so both write through exactly the same
// (user_id, idempotency_key) rule.
import type { createClient } from '@/lib/supabase/client';
import type { PaymentLedgerIO, PaymentLedgerRow } from '@/lib/payment-idempotency';

type BrowserClient = ReturnType<typeof createClient>;

export function ledgerFrom(supabase: BrowserClient): PaymentLedgerIO {
  return {
    insertOnce: async (row) => {
      // ignore-duplicates → ON CONFLICT (user_id, idempotency_key) DO NOTHING
      const { error } = await supabase.from('invoice_payments').upsert(row, {
        onConflict: 'user_id,idempotency_key',
        ignoreDuplicates: true,
      });
      return { error };
    },
    findByKey: async (userId, key) => {
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
    },
  };
}
