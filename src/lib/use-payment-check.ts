'use client';
// Chat's payment check queue (design section A, cards 1a/1b/1c).
//
// One fetch of the owner's sent/overdue invoices, then a cursor. The count
// stays "2 of 3" after a Yes (the paid row stays in the fetched array), which
// is what the design shows; a snooze also advances the cursor. The ledger is
// still the source of truth: markPaid inserts one row and the DB trigger moves
// the invoice to paid. Undo deletes only that row, guarded by its source.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { localDateString } from '@/lib/record-payment';
import {
  addPaymentCheckSnooze,
  parsePaymentCheckSnoozes,
  paymentCheckCandidates,
  PAYMENT_CHECK_SNOOZE_KEY,
  remainingBalance,
  type PaymentCheckInvoice,
  type PaymentCheckMethod,
} from '@/lib/payment-check';

const HOLD_MS = 4000;

export interface PaymentCheckDone {
  invoice: PaymentCheckInvoice;
  method: PaymentCheckMethod;
  /** ISO timestamp for the local calendar date chosen in the sheet. */
  paidAt: string;
  ledgerId: string;
}

function readSnoozes(nowMs: number): Record<string, number> {
  try {
    return parsePaymentCheckSnoozes(localStorage.getItem(PAYMENT_CHECK_SNOOZE_KEY), nowMs);
  } catch {
    return {};
  }
}

function writeSnoozes(map: Record<string, number>) {
  try { localStorage.setItem(PAYMENT_CHECK_SNOOZE_KEY, JSON.stringify(map)); } catch { /* private mode */ }
}

export function usePaymentCheck({ active, userId }: { active: boolean; userId: string | null }) {
  const supabase = createClient();
  const [queue, setQueue] = useState<PaymentCheckInvoice[]>([]);
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState<PaymentCheckDone | null>(null);
  const [loading, setLoading] = useState(false);
  const snoozesRef = useRef<Record<string, number>>({});
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHold = useCallback(() => {
    if (holdRef.current) { clearTimeout(holdRef.current); holdRef.current = null; }
  }, []);

  useEffect(() => () => clearHold(), [clearHold]);

  const load = useCallback(async () => {
    if (!userId) {
      setQueue([]);
      setIndex(0);
      setDone(null);
      return;
    }
    clearHold();
    setLoading(true);
    const { data, error } = await supabase
      .from('invoices')
      .select('id, client_name, invoice_number, total, amount_paid, status, due_date, sent_at, first_sent_at, created_at, kind, deleted_at')
      .eq('kind', 'invoice')
      .is('deleted_at', null)
      .in('status', ['sent', 'overdue'])
      .order('created_at', { ascending: true })
      .limit(100);
    if (error) {
      console.error('payment check queue failed', error);
      setQueue([]);
      setIndex(0);
      setLoading(false);
      return;
    }
    const now = new Date();
    const snoozes = readSnoozes(now.getTime());
    snoozesRef.current = snoozes;
    setQueue(paymentCheckCandidates((data ?? []) as PaymentCheckInvoice[], {
      now,
      today: localDateString(now),
      snoozedUntil: snoozes,
    }));
    setIndex(0);
    setDone(null);
    setLoading(false);
  }, [clearHold, supabase, userId]);

  // Load when Chat is the visible tab. The deck keeps Chat mounted, so this
  // also refreshes the queue when the user comes back to it.
  useEffect(() => {
    if (active && userId) void load();
    else if (!userId) { setQueue([]); setIndex(0); setDone(null); }
  }, [active, load, userId]);

  const advance = useCallback(() => {
    clearHold();
    setDone(null);
    setIndex((i) => i + 1);
  }, [clearHold]);

  const snooze = useCallback((invoice: PaymentCheckInvoice) => {
    const nowMs = Date.now();
    const next = addPaymentCheckSnooze(snoozesRef.current, invoice.id, nowMs);
    snoozesRef.current = next;
    writeSnoozes(next);
    clearHold();
    setDone(null);
    setIndex((i) => i + 1);
  }, [clearHold]);

  const markPaid = useCallback(async (
    invoice: PaymentCheckInvoice,
    method: PaymentCheckMethod,
    paidAt: string,
  ): Promise<string | null> => {
    if (!userId) return 'Please sign in again.';
    const amount = remainingBalance(invoice);
    if (!(amount > 0)) return 'This invoice no longer has a balance.';

    const { data, error } = await supabase
      .from('invoice_payments')
      .insert({
        invoice_id: invoice.id,
        user_id: userId,
        amount,
        method,
        paid_at: paidAt,
        paid_source: 'payment_check_card',
      })
      .select('id')
      .single();

    if (error || !data?.id) {
      console.error('payment check mark paid failed', error);
      return 'Couldn’t mark paid. Try again.';
    }

    setDone({ invoice, method, paidAt, ledgerId: String(data.id) });
    clearHold();
    holdRef.current = setTimeout(advance, HOLD_MS);
    return null;
  }, [advance, clearHold, supabase, userId]);

  // Undo is only offered during the 4s hold, so `index` still points at this
  // invoice. Delete the exact row we inserted, never a Stripe or older manual
  // payment; the ledger trigger puts amount_paid/status/paid_at back.
  const undo = useCallback(async (): Promise<boolean> => {
    if (!done) return false;
    clearHold();
    const { error } = await supabase
      .from('invoice_payments')
      .delete()
      .eq('id', done.ledgerId)
      .eq('paid_source', 'payment_check_card');
    if (error) {
      console.error('payment check undo failed', error);
      return false;
    }
    setDone(null);
    return true;
  }, [clearHold, done, supabase]);

  return {
    loading,
    queue,
    index,
    current: queue[index] ?? null,
    total: queue.length,
    done,
    markPaid,
    snooze,
    undo,
    reload: load,
  };
}
