'use client';

// Item 9: the cream top-drop toast for an event that lands while the app is
// open. Direction A only (cream, never black); PopToast/UndoToast are not
// touched and keep their own jobs (an undo window, a bottom info pill).
//
// It is a realtime listener, not a second source of truth: the thread is the
// record, this is the nudge. Nothing is shown for the catch-up query, so
// reopening the app never replays yesterday as a stack of toasts.
//
// Rules it obeys: no haptics, no recaps, reduced motion respected (no drop, a
// plain fade), one toast at a time, and it dismisses itself. Tapping it opens
// the document; the card in the thread stays where it is.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import type { IconName } from '@/components/icon-names';
import { createClient } from '@/lib/supabase/client';
import { money } from '@/lib/financials';
import { eventCard, type EventRow } from '@/lib/events';

const HOLD_MS = 5000;
const COLUMNS =
  'id, user_id, kind, actor, invoice_id, document_kind, document_number, client_name, amount, meta, dedupe_key, seen_at, acted_at, acted_result, occurred_at';

export default function EventToastHost() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [queue, setQueue] = useState<EventRow[]>([]);
  const [shown, setShown] = useState(false);
  const seenIds = useRef(new Set<string>());

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const { data: { user } } = await createClient().auth.getUser();
        if (alive) setUserId(user?.id ?? null);
      } catch { /* signed out */ }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`events-toast-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'events', filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as unknown as EventRow;
          if (!row?.id || seenIds.current.has(row.id)) return;
          seenIds.current.add(row.id);
          setQueue((q) => [...q, row].slice(-3));
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId]);

  const current = queue[0] ?? null;

  // Enter on the next frame so the drop is a transition, not a jump.
  useEffect(() => {
    if (!current) { setShown(false); return; }
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, [current]);

  // Hold, then step to the next one. A new event does not reset the clock of
  // the toast already on screen.
  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => {
      setShown(false);
      setQueue((q) => q.slice(1));
    }, HOLD_MS);
    return () => clearTimeout(t);
  }, [current]);

  if (!current) return null;

  const card = eventCard(current, money);
  const gold = card.tone === 'gold' || card.tone === 'success';
  const close = () => { setShown(false); setQueue((q) => q.slice(1)); };
  const open = () => {
    const href = current.invoice_id ? `/invoices/${current.invoice_id}` : null;
    close();
    if (href) router.push(href);
  };

  return (
    <div
      aria-live="polite"
      role="status"
      className="pointer-events-none fixed left-1/2 top-[72px] z-[95] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 md:top-4"
    >
      <div
        className={`pointer-events-auto overflow-hidden rounded-[18px] border border-outline-variant/70 bg-surface-container-low shadow-card-raised transition duration-200 ease-out motion-reduce:transition-none ${
          shown ? 'translate-y-0 opacity-100' : '-translate-y-3 opacity-0'
        }`}
      >
        <div className="flex items-start gap-3 px-4 py-3">
          <span
            className={`mt-0.5 grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full ${
              gold ? 'bg-primary-container' : 'bg-surface-container-high'
            }`}
          >
            <Icon name={card.icon as IconName} size={16} className={gold ? 'text-on-background' : 'text-on-surface-variant'} />
          </span>
          {current.invoice_id ? (
            <button type="button" onClick={open} className="min-w-0 flex-1 text-left">
              <p className="text-[14.5px] font-semibold leading-snug text-on-surface">{card.title}</p>
              {card.detail && <p className="mt-0.5 truncate text-[12.5px] leading-snug text-on-surface-variant">{card.detail}</p>}
            </button>
          ) : (
            <div className="min-w-0 flex-1">
              <p className="text-[14.5px] font-semibold leading-snug text-on-surface">{card.title}</p>
              {card.detail && <p className="mt-0.5 truncate text-[12.5px] leading-snug text-on-surface-variant">{card.detail}</p>}
            </div>
          )}
          <button
            type="button"
            onClick={close}
            aria-label="Dismiss"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-on-surface-variant transition active:scale-95"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
