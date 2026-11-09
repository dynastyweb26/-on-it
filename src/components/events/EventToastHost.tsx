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
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import type { IconName } from '@/components/icon-names';
import { createClient } from '@/lib/supabase/client';
import { money } from '@/lib/financials';
import { reducedMotion } from '@/lib/list-motion';
import { eventAction, eventCard, eventToasts, toastsToShow, type EventAction, type EventRow } from '@/lib/events';

const DWELL_VIEW_MS = 4000;
const DWELL_MONEY_MS = 5000;
const DWELL_ACTION_MS = 8000;
const SWIPE_DISMISS_PX = 32;
const FLICK_PX_PER_MS = 0.5;
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
  // only ids this device has never toasted. seen_at is deliberately NOT a
  // filter: the chat's feed stamps it within a second of a live insert, and
  // that must not pre-empt this query and swallow the toast.
  const catchUp = useCallback(async () => {
    if (!userId) return;
    try {
      const since = new Date(Date.now() - CATCHUP_WINDOW_MS).toISOString();
      const { data, error } = await createClient()
        .from('events')
        .select(COLUMNS)
        .eq('user_id', userId)
        .gte('occurred_at', since)
        .order('occurred_at', { ascending: false })
        .limit(12);
      if (error) return;
      const fresh = toastsToShow((data ?? []) as unknown as EventRow[], readToasted(userId), QUEUE_MAX);
      if (fresh.length === 0) return;
      fresh.forEach((e) => markToasted(userId, e.id));
      setQueue((q) => enqueue(q, fresh));
    } catch { /* no catch-up; live toasts still work */ }
  }, [userId]);

  // Once for the resolved user, then again whenever the tab comes back: a
  // realtime insert missed while the tab was suspended must not lose the
  // toast. The per-device toasted set is the only dedupe.
  useEffect(() => {
    if (!userId) return;
    void catchUp();
    const onVisible = () => { if (document.visibilityState === 'visible') void catchUp(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [catchUp, userId]);

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
          // Item 19: a time event ('four days passed') is a card in the thread,
          // never a toast. Client events keep theirs.
          if (!eventToasts(row)) return;
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

  // Dwell by kind (spec 01): 4 s for a view, 5 s for money, 8 s when the toast is
  // offering a decision. A finger down pauses the clock; lifting resumes it.
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAt = useRef(0);
  const remaining = useRef(0);
  const gesture = useRef<{ y: number; t: number } | null>(null);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const advance = () => {
    clearTimer();
    setShown(false);
    setDragY(0);
    setDragging(false);
    gesture.current = null;
    setQueue((q) => q.slice(1));
  };

  const arm = (ms: number) => {
    clearTimer();
    startedAt.current = Date.now();
    remaining.current = ms;
    timer.current = setTimeout(advance, ms);
  };

  useEffect(() => {
    if (!item) { clearTimer(); setShown(false); return; }
    const tone = eventCard(item.event, money).tone;
    const dwell = item.action
      ? DWELL_ACTION_MS
      : tone === 'gold' || tone === 'success' ? DWELL_MONEY_MS : DWELL_VIEW_MS;
    arm(dwell);
    return clearTimer;
  }, [item]);

  // Enter on the next frame: the toast mounts at opacity 0 and the transition
  // plays on the next paint, so the drop is a movement rather than a jump.
  // advance() sets it back to false, which is the exit.
  useEffect(() => {
    if (!item) { setShown(false); return; }
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, [item]);

  const pause = () => {
    if (!timer.current) return;
    remaining.current = Math.max(800, remaining.current - (Date.now() - startedAt.current));
    clearTimer();
  };
  const resume = () => {
    if (timer.current) return;
    arm(remaining.current || DWELL_VIEW_MS);
  };

  if (!current) return null;

  const card = eventCard(current, money);
  const gold = card.tone === 'gold' || card.tone === 'success';
  const waiting = queue.length - 1;

  const open = () => {
    const href = current.invoice_id ? `/invoices/${current.invoice_id}` : null;
    advance();
    if (href) router.push(href);
  };

  // The toast's decision, on the same two routes the cards use: Convert reaches
  // the estimate's own confirm sheet, Send reminder lands on the invoice that
  // holds Request balance.
  const runAction = (action: EventAction) => {
    const id = current.invoice_id;
    advance();
    if (!id) return;
    router.push(action === 'convert' ? `/invoices/${id}?convert=1` : `/invoices/${id}`);
  };

  function onPointerDown(e: React.PointerEvent) {
    gesture.current = { y: e.clientY, t: Date.now() };
    setDragging(true);
    pause();
  }
  function onPointerMove(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g) return;
    const dy = Math.min(0, e.clientY - g.y);
    if (dy < 0) setDragY(dy);
  }
  function onPointerUp() {
    const g = gesture.current;
    gesture.current = null;
    setDragging(false);
    if (!g) { setDragY(0); resume(); return; }
    // Up 32px is a dismissal; so is a quick flick, even a short one.
    const ms = Math.max(1, Date.now() - g.t);
    if (dragY <= -SWIPE_DISMISS_PX || dragY / ms <= -FLICK_PX_PER_MS) { advance(); return; }
    setDragY(0);
    resume();
  }

  // Reduced motion: the toast appears and disappears in place, no slide.
  const reduce = reducedMotion();
  const offset = reduce ? 0 : shown ? dragY : dragY - 12;

  return (
    <div
      aria-live="polite"
      role="status"
      className="pointer-events-none fixed left-1/2 top-[72px] z-[95] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 flex-col items-end gap-1.5 md:top-4"
    >
      {waiting > 0 && (
        <span
          aria-hidden
          className="mr-2 rounded-full bg-surface-container-high px-2 py-0.5 text-[11px] font-bold text-on-surface-variant shadow-card-raised"
        >
          +{waiting}
        </span>
      )}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { gesture.current = null; setDragging(false); setDragY(0); resume(); }}
        style={{
          transform: `translateY(${offset}px)`,
          opacity: shown ? 1 : 0,
          transition: dragging || reduce ? 'none' : 'transform 200ms ease-out, opacity 200ms ease-out',
        }}
        className="pointer-events-auto w-full touch-pan-x overflow-hidden rounded-[18px] border border-outline-variant/70 bg-surface-container-low shadow-card-raised motion-reduce:transition-none"
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
            onClick={advance}
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
