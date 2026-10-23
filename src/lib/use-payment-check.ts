'use client';
// Chat's payment check queue (design section A, cards 1a/1b/1c).
//
// One fetch of the owner's sent/overdue invoices, then a cursor. The count
// stays "2 of 3" after a Yes (the paid row stays in the fetched array), which
// is what the design shows; a snooze also advances the cursor. The ledger is
// still the source of truth; the write path lands in the next commit.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { localDateString } from '@/lib/record-payment';
import {
  addPaymentCheckSnooze,
  parsePaymentCheckSnoozes,
  paymentCheckCandidates,
  PAYMENT_CHECK_SNOOZE_KEY,
  type PaymentCheckInvoice,
  type PaymentCheckMethod,
} from '@/lib/payment-check';

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
  // Filled by the write path (next commit).
  const [done] = useState<PaymentCheckDone | null>(null);
  const [loading, setLoading] = useState(false);
  const snoozesRef = useRef<Record<string, number>>({});

  const load = useCallback(async () => {
    if (!userId) {
      setQueue([]);
      setIndex(0);
      return;
    }
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
    setLoading(false);
  }, [supabase, userId]);

  // Load when Chat is the visible tab. The deck keeps Chat mounted, so this
  // also refreshes the queue when the user comes back to it.
  useEffect(() => {
    if (active && userId) void load();
    else if (!userId) { setQueue([]); setIndex(0); }
  }, [active, load, userId]);

  const snooze = useCallback((invoice: PaymentCheckInvoice) => {
    const nowMs = Date.now();
    const next = addPaymentCheckSnooze(snoozesRef.current, invoice.id, nowMs);
    snoozesRef.current = next;
    writeSnoozes(next);
    setIndex((i) => i + 1);
  }, []);

  const markPaid = useCallback(async (
    _invoice: PaymentCheckInvoice,
    _method: PaymentCheckMethod,
    _paidAt: string,
  ): Promise<string | null> => {
    return 'Payment check is not connected yet.';
  }, []);

  const undo = useCallback(async (): Promise<boolean> => false, []);

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
