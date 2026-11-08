'use client';

// Item 9: the cream top-drop toast for an event. Direction A only (cream,
// never black); PopToast/UndoToast are untied from it and keep their jobs (an
// undo window, a bottom info pill).
//
// Correction 1: on app open it catches up on what happened while the owner was
// away — unseen events from the last 24 hours, newest first, at most three.
// Replays are prevented by a per-user localStorage set of toasted ids, NOT by
// seen_at: the cards in the thread stamp seen_at as they render, and that race
// must not swallow a toast (or resurrect one).
//
// Realtime inserts still toast live. Nothing here is a source of truth: the
// thread is the record, this is the nudge.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import type { IconName } from '@/components/icon-names';
import { createClient } from '@/lib/supabase/client';
import { money } from '@/lib/financials';
import { eventAction, eventCard, type EventAction, type EventRow } from '@/lib/events';

const HOLD_MS = 5000;
const CATCHUP_WINDOW_MS = 24 * 3600e3;
const QUEUE_MAX = 3;
const TOASTED_CAP = 200;

const COLUMNS =
  'id, user_id, kind, actor, invoice_id, document_kind, document_number, client_name, amount, meta, dedupe_key, seen_at, acted_at, acted_result, occurred_at';

const toastedKey = (userId: string) => `onit-events-toasted:${userId}`;

function readToasted(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(toastedKey(userId));
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? arr.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Remember one id, capped so the set cannot grow forever. */
function markToasted(userId: string, id: string): void {
  try {
    const set = readToasted(userId);
    if (set.has(id)) return;
    const next = [...set, id].slice(-TOASTED_CAP);
    localStorage.setItem(toastedKey(userId), JSON.stringify(next));
  } catch { /* storage blocked — the 24h window still bounds a replay */ }
}

type ToastItem = { event: EventRow; action: EventAction | null };

const toItem = (e: EventRow): ToastItem => ({ event: e, action: eventAction(String(e.kind)) });

/** Append rows, never twice, capped at three. */
const enqueue = (q: ToastItem[], rows: EventRow[]): ToastItem[] => {
  const known = new Set(q.map((i) => i.event.id));
  return [...q, ...rows.filter((r) => !known.has(r.id)).map(toItem)].slice(-QUEUE_MAX);
};

export default function EventToastHost() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [queue, setQueue] = useState<ToastItem[]>([]);
  const [shown, setShown] = useState(false);

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

  // App open: catch up on what was missed. Newest first, three at most, and
  // only ids this device has never toasted.
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void (async () => {
      try {
        const since = new Date(Date.now() - CATCHUP_WINDOW_MS).toISOString();
        const { data, error } = await createClient()
          .from('events')
          .select(COLUMNS)
          .eq('user_id', userId)
          .is('seen_at', null)
          .gte('occurred_at', since)
          .order('occurred_at', { ascending: false })
          .limit(12);
        if (error || !alive) return;
        const toasted = readToasted(userId);
        const fresh = ((data ?? []) as unknown as EventRow[])
          .filter((e) => e?.id && !toasted.has(e.id))
          .slice(0, QUEUE_MAX);
        if (fresh.length === 0) return;
        fresh.forEach((e) => markToasted(userId, e.id));
        setQueue((q) => enqueue(q, fresh));
      } catch { /* no catch-up; live toasts still work */ }
    })();
    return () => { alive = false; };
  }, [userId]);

  // Live: this user's new rows, nothing else.
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
          if (!row?.id) return;
          if (readToasted(userId).has(row.id)) return;
          markToasted(userId, row.id);
          setQueue((q) => enqueue(q, [row]));
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId]);

  const item = queue[0] ?? null;
  const current = item?.event ?? null;

  // Enter on the next frame so the drop is a transition, not a jump.
  useEffect(() => {
    if (!current) { setShown(false); return; }
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, [current]);

  // Hold, then step to the next one. A new event never resets the clock of the
  // toast already on screen.
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

  // The toast's decision, on the same two routes the cards use: Convert reaches
  // the estimate's own confirm sheet, Send reminder lands on the invoice that
  // holds Request balance.
  const runAction = (action: EventAction) => {
    const id = current?.invoice_id;
    close();
    if (!id) return;
    router.push(action === 'convert' ? `/invoices/${id}?convert=1` : `/invoices/${id}`);
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
          {item?.action && current.invoice_id && (
            <button
              type="button"
              onClick={() => runAction(item.action as EventAction)}
              className="shrink-0 rounded-full border border-primary/40 px-3 py-1.5 text-[12.5px] font-bold text-primary transition active:scale-95"
            >
              {item.action === 'convert' ? 'Convert' : 'Send reminder'}
            </button>
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
