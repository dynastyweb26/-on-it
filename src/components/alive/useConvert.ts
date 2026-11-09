'use client';

// The one place an event card or toast converts an estimate (alive layer 07).
// State lives in a tiny module store so the toast and the thread card for the
// same event always agree, and a second tap is ignored by a synchronous guard
// (interaction rules 2 and 3): it never creates, never posts a second card.
import { useSyncExternalStore } from 'react';
import { createClient } from '@/lib/supabase/client';
import { convertEstimateToInvoice } from '@/lib/estimates/convert-client';
import { formatDocNumber } from '@/lib/documents';
import { postOwnerCard } from '@/lib/owner-cards';
import type { EventRow } from '@/lib/events';

/** Fired on a successful conversion so a mounted list can refresh and animate. */
export const ESTIMATE_CONVERTED_EVENT = 'onit:estimate-converted';
export type EstimateConverted = { estimateId: string; invoiceId: string; number: number | null };

export type ConvertState =
  | { phase: 'idle' }
  | { phase: 'busy' }
  | { phase: 'done'; number: number | null }
  | { phase: 'error'; message: string };

const IDLE: ConvertState = { phase: 'idle' };
const states = new Map<string, ConvertState>();
const inflight = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (id: string, s: ConvertState) => { states.set(id, s); emit(); };

/** A row that was already converted (acted_result 'converted:<n>') is done. */
export function convertStateOf(e: Pick<EventRow, 'id' | 'acted_at' | 'acted_result'>): ConvertState {
  const live = states.get(e.id);
  if (live) return live;
  if (e.acted_at && typeof e.acted_result === 'string' && e.acted_result.startsWith('converted')) {
    const n = Number(e.acted_result.split(':')[1]);
    return { phase: 'done', number: Number.isFinite(n) && n > 0 ? n : null };
  }
  return IDLE;
}

export function useConvertState(e: Pick<EventRow, 'id' | 'acted_at' | 'acted_result'>): ConvertState {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => convertStateOf(e),
    () => IDLE,
  );
}

/** Run the conversion for a signed-estimate event. `onPaywall` is called with
 *  the estimate id so the caller can open the estimate, where the paywall lives. */
export async function runConvert(e: EventRow, onPaywall: (estimateId: string) => void): Promise<void> {
  if (!e.invoice_id) return;
  if (inflight.has(e.id)) return;
  if (convertStateOf(e).phase === 'done') return;
  inflight.add(e.id);
  set(e.id, { phase: 'busy' });
  try {
    const supabase = createClient();
    const out = await convertEstimateToInvoice(supabase, e.invoice_id);
    if (out.ok) {
      set(e.id, { phase: 'done', number: out.number });
      try {
        window.dispatchEvent(new CustomEvent<EstimateConverted>(ESTIMATE_CONVERTED_EVENT, {
          detail: { estimateId: e.invoice_id, invoiceId: out.id, number: out.number },
        }));
      } catch { /* no window */ }
      if (!out.existed) {
        postOwnerCard({
          title: out.number != null ? `${formatDocNumber('invoice', out.number)} is ready` : 'Your invoice is ready',
          invoiceId: out.id,
        });
      }
      try {
        await supabase.from('events')
          .update({ acted_at: new Date().toISOString(), acted_result: `converted:${out.number ?? ''}` })
          .eq('id', e.id);
      } catch { /* the check row still shows for this session */ }
      return;
    }
    if (out.reason === 'paywall') { states.delete(e.id); emit(); onPaywall(e.invoice_id); return; }
    const message =
      out.reason === 'signed_out' ? 'You’re signed out. Sign in and try again.'
      : out.reason === 'not_signed' ? 'This estimate isn’t signed yet.'
      : out.reason === 'not_found' ? 'That estimate is gone.'
      : 'Couldn’t create the invoice. Try again.';
    set(e.id, { phase: 'error', message });
  } catch {
    set(e.id, { phase: 'error', message: 'Couldn’t create the invoice. Try again.' });
  } finally {
    inflight.delete(e.id);
  }
}
