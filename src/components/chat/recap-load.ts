// The rows a recap card is built from. Browser Supabase client, own rows only
// (RLS). Read-only: nothing here writes. A failed read returns null so the
// caller can say so instead of posting a card of zeros.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OpenInvoiceRow, PaymentRow, SignedRow } from '@/lib/chat-recap';

const DAYS = 100; // ~14 weeks: enough for "best week since …"

export async function loadRecapRows(
  supabase: SupabaseClient,
): Promise<{ payments: PaymentRow[]; open: OpenInvoiceRow[]; signed: SignedRow[] } | null> {
  try {
    const since = new Date(Date.now() - DAYS * 86400e3).toISOString();
    const [pay, open, signed] = await Promise.all([
      supabase.from('invoice_payments').select('amount, paid_at, entry_type').gte('paid_at', since).limit(2000),
      supabase.from('invoices').select('total, amount_paid, status, due_date')
        .eq('kind', 'invoice').in('status', ['sent', 'overdue']).is('deleted_at', null).limit(500),
      supabase.from('invoices').select('approved_at')
        .eq('kind', 'quote').not('approved_at', 'is', null).gte('approved_at', since).is('deleted_at', null).limit(500),
    ]);
    if (pay.error || open.error || signed.error) return null;
    return {
      payments: (pay.data ?? []) as PaymentRow[],
      open: (open.data ?? []) as OpenInvoiceRow[],
      signed: (signed.data ?? []) as SignedRow[],
    };
  } catch {
    return null;
  }
}
