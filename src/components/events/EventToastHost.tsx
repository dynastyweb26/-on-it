'use client';

// Alive layer 01 · Toast, Direction A (cream). Slides down over the header,
// never under it. One anatomy for every event: tinted tile, bold title, one
// detail line, chevron. Every figure here is from On_It_Alive_Layer 01:
//   enter 380ms (.2,.9,.3,1), shadow in over the last 120ms, exit 220ms
//   (.4,0,1,1); queue of 3 with +N and stacked back cards (.94/.88, y 12/22,
//   opacity .9/.75); tap the stack to fan it out ("N updates / Clear all", 280ms
//   (.2,.8,.2,1), 8px gaps); swipe up 32px or 500px/s dismisses, 96px clears
//   all; the clock pauses while a finger is down; arrivals stagger by 80ms.
//
// Catch-up on app open and the replay guard are unchanged: unseen events from
// the last 24h, newest first, three at most, remembered per user in
// localStorage (NOT seen_at, which the thread stamps as it renders).
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { money } from '@/lib/financials';
import { formatDocNumber } from '@/lib/documents';
import { eventAction, eventCard, type EventRow } from '@/lib/events';
import { dwellMs, enqueueIds, EXIT_MS, EXPAND_MS, shouldCollapse, STAGGER_MS, stackStep, swipeOutcome, TOAST_MAX, TOAST_Z } from '@/lib/toast-queue';
import { EventTile, EventText } from '@/components/alive/EventParts';
import Icon from '@/components/Icon';
import { runConvert, useConvertState } from '@/components/alive/useConvert';
import '@/components/alive/alive.css';

const CATCHUP_WINDOW_MS = 24 * 3600e3;
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

function markToasted(userId: string, id: string): void {
  try {
    const set = readToasted(userId);
    if (set.has(id)) return;
    localStorage.setItem(toastedKey(userId), JSON.stringify([...set, id].slice(-TOASTED_CAP)));
  } catch { /* storage blocked: the 24h window still bounds a replay */ }
}

/** "just now" for a fresh event, otherwise the local clock time. */
function whenText(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t) || Date.now() - t < 2 * 60e3) return 'just now';
  return new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function EventToastHost() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [queue, setQueue] = useState<EventRow[]>([]);
  const [leaving, setLeaving] = useState<string | null>(null); // id playing its exit
  const [expanded, setExpanded] = useState(false);

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

  // App open: what was missed. Newest first, three at most, never toasted here.
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void (async () => {
      try {
        const since = new Date(Date.now() - CATCHUP_WINDOW_MS).toISOString();
        const { data, error } = await createClient()
          .from('events').select(COLUMNS).eq('user_id', userId)
          .is('seen_at', null).gte('occurred_at', since)
          .order('occurred_at', { ascending: false }).limit(12);
        if (error || !alive) return;
        const toasted = readToasted(userId);
        const fresh = ((data ?? []) as unknown as EventRow[])
          .filter((e) => e?.id && !toasted.has(e.id)).slice(0, TOAST_MAX);
        if (fresh.length === 0) return;
        fresh.forEach((e) => markToasted(userId, e.id));
        setQueue((q) => enqueueIds(q, fresh));
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
          if (!row?.id || readToasted(userId).has(row.id)) return;
          markToasted(userId, row.id);
          setQueue((q) => enqueueIds(q, [row]));
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId]);

  const front = queue[0] ?? null;

  // ── The clock: dwell by kind, paused by a finger or the expanded stack ──
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAt = useRef(0);
  const remaining = useRef(0);
  const clearTimer = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };

  /** Play the 220ms exit, then drop `ids` from the queue. */
  const dismiss = (ids: string[]) => {
    clearTimer();
    if (ids.length === 0) return;
    setLeaving(ids[0]);
    window.setTimeout(() => {
      setQueue((q) => q.filter((e) => !ids.includes(e.id)));
      setLeaving(null);
    }, EXIT_MS);
  };
  const dismissFront = () => { if (front) dismiss([front.id]); };
  const clearAll = () => { setExpanded(false); dismiss(queue.map((e) => e.id)); };

  const arm = (ms: number) => {
    clearTimer();
    startedAt.current = Date.now();
    remaining.current = ms;
    timer.current = setTimeout(dismissFront, ms);
  };
  const pause = () => {
    if (!timer.current) return;
    remaining.current = Math.max(800, remaining.current - (Date.now() - startedAt.current));
    clearTimer();
  };
  const resume = () => { if (!timer.current && front && !expanded) arm(remaining.current || 4000); };

  // An expanded stack with one card left has no "N updates" to show and would
  // sit with no clock running: fold it back to the single toast.
  useEffect(() => {
    if (shouldCollapse(queue.length, expanded)) setExpanded(false);
  }, [queue.length, expanded]);

  useEffect(() => {
    if (!front || expanded) { if (!front) setExpanded(false); clearTimer(); return; }
    const card = eventCard(front, money);
    arm(dwellMs(String(front.kind), card.tone, eventAction(String(front.kind)) === 'convert'));
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [front?.id, expanded]);

  // ── Gesture: swipe up, finger-down pause, tap ──
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{ y: number; t: number; moved: boolean } | null>(null);

  function onPointerDown(e: RPointerEvent) {
    gesture.current = { y: e.clientY, t: Date.now(), moved: false };
    setDragging(true);
    pause();
  }
  function onPointerMove(e: RPointerEvent) {
    const g = gesture.current;
    if (!g) return;
    const dy = Math.min(0, e.clientY - g.y);
    if (dy < -6) g.moved = true;
    setDragY(dy);
  }
  function onPointerEnd(cancel: boolean) {
    const g = gesture.current;
    setDragging(false);
    if (!g || cancel) { gesture.current = null; setDragY(0); resume(); return; }
    const out = swipeOutcome(dragY, Date.now() - g.t);
    setDragY(0);
    if (out === 'clear') { clearAll(); return; }
    if (out === 'dismiss') { dismissFront(); return; }
    resume();
  }

  // ── What a tap does ──
  const openDoc = (e: EventRow) => {
    const href = e.invoice_id ? `/invoices/${e.invoice_id}` : null;
    dismiss([e.id]);
    if (href) router.push(href);
  };
  const act = (e: EventRow) => {
    if (!e.invoice_id) return;
    if (eventAction(String(e.kind)) === 'convert') {
      void runConvert(e, (estimateId) => router.push(`/invoices/${estimateId}?convert=1`));
    } else {
      dismiss([e.id]);
      router.push(`/invoices/${e.invoice_id}`);
    }
  };
  function onBodyClick(ev: React.MouseEvent, e: EventRow) {
    if ((ev.target as HTMLElement).closest('[data-toast-action]')) return;
    if (gesture.current?.moved) return;
    if (queue.length > 1 && !expanded) { setExpanded(true); return; }
    openDoc(e);
  }

  if (!front) return null;
  const waiting = queue.length - 1;

  const wrap: CSSProperties = {
    // --vv-top: while the iOS keyboard is open the visual viewport can be scrolled
    // down inside the layout viewport (lib/keyboard.ts); the toast follows it.
    // z 96: above every sheet, modal and the recap story player (95); only the
    // splash and the walkthrough takeover (1000+) sit over it.
    position: 'fixed', left: 10, right: 10, top: 'calc(var(--vv-top, 0px) + env(safe-area-inset-top, 0px) + 4px)',
    zIndex: TOAST_Z, maxWidth: 448, margin: '0 auto', pointerEvents: 'none',
  };

  return (
    <div aria-live="polite" role="status" style={wrap}>
      {expanded && (
        <button
          type="button"
          aria-label="Close updates"
          onClick={() => setExpanded(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(252,247,240,.4)', backdropFilter: 'blur(1.5px)', WebkitBackdropFilter: 'blur(1.5px)', pointerEvents: 'auto', border: 0, zIndex: -1 }}
        />
      )}

      {expanded ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 6px' }}>
            <span className="al-tt" style={{ fontSize: 14 }}>{queue.length} updates</span>
            <button type="button" onClick={clearAll} style={{ font: "600 13px var(--font-inter), system-ui", color: 'var(--al-gold-link)', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>Clear all</button>
          </div>
          {queue.map((e, i) => (
            <ExpandedRow key={e.id} event={e} index={i} onOpen={() => openDoc(e)} onAct={() => act(e)} />
          ))}
          <div className="al-grab" style={{ marginTop: 2 }} />
        </div>
      ) : (
        <div style={{ position: 'relative', pointerEvents: 'auto' }}>
          {queue.slice(1).map((e, i) => {
            const s = stackStep(i + 1);
            return (
              <div
                key={e.id}
                className="al-ta"
                aria-hidden
                style={{
                  position: 'absolute', left: 0, right: 0, top: s.y, height: 72, padding: 0,
                  transform: `scale(${s.scale})`, transformOrigin: 'top center', opacity: s.opacity,
                  zIndex: -(i + 1), animation: `al-fade-up .28s var(--al-ease-settle) ${(i + 1) * STAGGER_MS}ms both`,
                }}
              />
            );
          })}
          <FrontToast
            event={front}
            waiting={waiting}
            leaving={leaving === front.id}
            dragY={dragY}
            dragging={dragging}
            handlers={{
              onPointerDown,
              onPointerMove,
              onPointerUp: () => onPointerEnd(false),
              onPointerCancel: () => onPointerEnd(true),
            }}
            onBodyClick={(ev) => onBodyClick(ev, front)}
            onAct={() => act(front)}
          />
        </div>
      )}
    </div>
  );
}

function ActionButton({ event, onAct, height = 40 }: { event: EventRow; onAct: () => void; height?: number }) {
  const conv = useConvertState(event);
  if (eventAction(String(event.kind)) !== 'convert') return null;
  if (conv.phase === 'done') {
    return (
      <div className="al-fade-up" style={{ display: 'flex', gap: 10, alignItems: 'center', height }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--al-gold)', display: 'grid', placeItems: 'center', flex: 'none', animation: 'al-pop-in .32s both' }}>
          <Icon name="check" size={17} />
        </div>
        <div style={{ flex: 1, font: "600 14px var(--font-inter), system-ui" }}>
          {conv.number != null ? `${formatDocNumber('invoice', conv.number)} created` : 'Invoice created'}
        </div>
      </div>
    );
  }
  return (
    <>
      <button type="button" data-toast-action className="al-btn-g" style={{ height }} disabled={conv.phase === 'busy'} onClick={onAct}>
        {conv.phase === 'busy' ? (<><span className="al-spinner" />Creating invoice…</>) : (<><Icon name="swap_horiz" size={18} />Convert to invoice</>)}
      </button>
      {conv.phase === 'error' && (
        <div role="alert" style={{ font: "400 12.5px var(--font-inter), system-ui", color: 'var(--al-rust)', textAlign: 'center' }}>{conv.message}</div>
      )}
    </>
  );
}

function FrontToast({
  event, waiting, leaving, dragY, dragging, handlers, onBodyClick, onAct,
}: {
  event: EventRow;
  waiting: number;
  leaving: boolean;
  dragY: number;
  dragging: boolean;
  handlers: Record<string, (e: RPointerEvent) => void>;
  onBodyClick: (e: React.MouseEvent) => void;
  onAct: () => void;
}) {
  const card = useMemo(() => eventCard(event, money, { when: whenText(event.occurred_at) }), [event]);
  const animation = leaving
    ? `al-toast-out ${EXIT_MS}ms var(--al-ease-out) both`
    : 'al-toast-in 380ms var(--al-ease-in) both';
  return (
    <div
      {...handlers}
      onClick={onBodyClick}
      style={{
        transform: dragY ? `translateY(${dragY}px)` : undefined,
        transition: dragging ? 'none' : 'transform 200ms var(--al-ease-settle)',
        touchAction: 'pan-x',
        position: 'relative',
        animation,
      }}
    >
      <div className="al-ta al-press" style={{ cursor: 'pointer', animation: leaving ? undefined : 'al-toast-shadow 120ms ease-out 260ms both' }}>
        <div className="al-trow">
          <EventTile card={card} />
          <EventText card={card} />
          {waiting > 0 ? (
            <div style={{ font: "700 11px var(--font-plex-mono), ui-monospace, monospace", background: 'var(--al-ink)', color: '#f4ecdd', borderRadius: 10, padding: '3px 7px' }}>+{waiting}</div>
          ) : (
            <span style={{ color: 'var(--al-faint)', display: 'inline-flex' }}><Icon name="chevron_right" size={18} /></span>
          )}
        </div>
        <ActionButton event={event} onAct={onAct} />
        <div className="al-grab" />
      </div>
    </div>
  );
}

function ExpandedRow({ event, index, onOpen, onAct }: { event: EventRow; index: number; onOpen: () => void; onAct: () => void }) {
  const card = useMemo(() => eventCard(event, money), [event]);
  const conv = useConvertState(event);
  const isConvert = eventAction(String(event.kind)) === 'convert';
  return (
    <div
      className="al-ta al-press"
      onClick={(ev) => { if (!(ev.target as HTMLElement).closest('[data-toast-action]')) onOpen(); }}
      style={{ padding: '10px 12px', cursor: 'pointer', animation: `al-fan-out ${EXPAND_MS}ms var(--al-ease-settle) ${index * STAGGER_MS}ms both` }}
    >
      <div className="al-trow">
        <EventTile card={card} size={34} />
        <EventText card={card} compact />
        {isConvert ? (
          <button
            type="button"
            data-toast-action
            disabled={conv.phase === 'busy' || conv.phase === 'done'}
            onClick={onAct}
            style={{ font: "700 12.5px var(--font-inter), system-ui", color: 'var(--al-gold-text)', background: 'var(--al-gold-soft)', borderRadius: 14, padding: '6px 10px', border: 0, cursor: 'pointer' }}
          >
            {conv.phase === 'busy' ? 'Creating…' : conv.phase === 'done' ? 'Created' : 'Convert'}
          </button>
        ) : (
          <span style={{ color: 'var(--al-faint)', display: 'inline-flex' }}><Icon name="chevron_right" size={18} /></span>
        )}
      </div>
    </div>
  );
}
