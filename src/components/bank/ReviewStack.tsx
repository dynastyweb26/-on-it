'use client';
// ═══ Bank activity stack ═══
// A bottom sheet on phones, a centred 440px dialog from 768px up, over a
// scrim. ONE stack of cards — money out and money in together — drag sideways
// to browse, act on the front card.
//
// Structural rules this file keeps (SPEC.txt, overridden where CHANGES.md says):
//   · role="dialog" aria-modal, labelled by the counter; Escape closes and
//     focus returns to whatever opened it.
//   · Focus order: X → top card … (the peeks are inert).
//   · "3 of 7" is aria-live and announces "Item 3 of 7", and 7 is To review's
//     own count: Ignored never enters it.
//   · Swipe is touch-only and rubber-banded at the ends; ← / → and the
//     on-screen prev/next buttons (pointer devices) are the keyboard path.
//   · ONE X, top-left. It shrinks the sheet and flies it to whichever Books nav
//     item is visible, then pulses that item. Unresolved items stay open: there
//     is no hidden state, so closing never loses a card.
//   · An edge swipe from the left 24px closes the stack like Escape does.
//   · Two tabs, always: To review N / Ignored N. Don't add and Keep move a card
//     to Ignored; Restore puts it back. Ignored counts toward nothing else.
//   · Reduced motion: no flight, no springs, no count-up; each action is one
//     fade and the card is simply gone.
//
// Deposits are read from the preview-gated deposits route (the URL lives in
// lib/bank-deposits) and decided by their own card. No Supabase client here.
import { useCallback, useEffect, useRef, useState, type CSSProperties, type Dispatch, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/Icon';
import BankToast from './BankToast';
import { DEPOSITS_CHANGED } from './useDepositReview';
import DepositCard from './DepositCard';
import ReviewCard, { type CardAction } from './ReviewCard';
import StackNav from './StackNav';
import { reducedMotion } from '@/lib/list-motion';
import {
  addedToast, advancesOptimistically, counterLabel, formatDay, formatMoney, itemAccount,
  nextQueueIndex, rubberBand, SWIPE_COMMIT_PX, swipeTransform,
  type BankAction, type BankItem, type BankReviewState,
} from '@/lib/bank-tracking';
import {
  DEPOSITS_URL, depositPlan, depositRefusalMessage, depositRestoreBody,
  type ApiDeposit, type DepositInvoice, type DepositPayment,
} from '@/lib/bank-deposits';
import {
  cardKindOf, ignoredEntries, restoreDeposit, resolveDeposit, stackEntries, type StackEntry,
} from '@/lib/bank-stack';
import { STACK_CARD_SLOT } from '@/lib/stack-fit';

type Leaving = {
  item: BankItem;
  mode: 'up' | 'left' | 'collapse';
  step: 'cover' | 'exit';
  cover: 'added' | 'linked' | null;
};

/** Whichever Books nav item is on screen: the tab bar below md, the rail or
 *  sidebar above it. Both carry /dashboard; only one has a box. */
function booksNavTarget(): HTMLElement | null {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>('[data-tab-target="/dashboard"], a[href="/dashboard"]'),
  );
  return candidates.find((el) => el.getClientRects().length > 0) ?? null;
}

/** The left edge belongs to the back gesture; inside the sheet it closes it. */
const EDGE_CLOSE_PX = 24;

export default function ReviewStack({
  state, dispatch, onClose, notice = null, busyIds = [], refused = null,
}: {
  state: BankReviewState;
  dispatch: Dispatch<BankAction>;
  onClose: () => void;
  /** A write from the provider, refused or confirmed: the toast slot. */
  notice?: { message: string; id: number } | null;
  /** Cards whose receipt add is still in flight: their buttons are locked. */
  busyIds?: string[];
  /** The refused receipt add that card reports under its receipt row. */
  refused?: { id: string; message: string } | null;
}) {
  // ── Money in: the deposits route, fetched once per open ──
  const [deposits, setDeposits] = useState<ApiDeposit[]>([]);
  const [moneyIn, setMoneyIn] = useState<{ invoices: DepositInvoice[]; payments: DepositPayment[] }>({
    invoices: [], payments: [],
  });

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const res = await fetch(DEPOSITS_URL, { cache: 'no-store' });
        const body = (await res.json().catch(() => null)) as unknown;
        const plan = depositPlan(res.status, body);
        if (!live || plan.kind !== 'rows') return;
        setDeposits(plan.deposits);
        setMoneyIn({ invoices: plan.invoices, payments: plan.payments });
      } catch {
        // Offline or gated: the stack still shows money out.
      }
    })();
    return () => { live = false; };
  }, []);

  const queue = stackEntries(state, deposits);
  const pending = queue.length;
  const passed = ignoredEntries(state, deposits);
  const filter = state.filter;
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const pos = Math.min(index, Math.max(0, queue.length - 1));
  indexRef.current = pos;
  const top = queue[pos] ?? null;

  // Dots mirror the real queue: past seven cards the row windows around the
  // current card. The old fixed slice of six left no dot matching the position
  // from the eighth card on, so the row pointed at the wrong card
  // (CHANGES.md · item 4).
  const DOT_MAX = 7;
  const dotCount = Math.min(queue.length, DOT_MAX);
  const dotStart = Math.max(0, Math.min(pos - Math.floor(DOT_MAX / 2), queue.length - DOT_MAX));

  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState<Leaving | null>(null);
  const [fly, setFly] = useState<{ x: number; y: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // A failed write is announced like any confirmation, once per failure.
  useEffect(() => {
    if (notice) setToast(notice.message);
  }, [notice]);
  const [announce, setAnnounce] = useState('');
  const [closing, setClosing] = useState(false);
  const [dealt, setDealt] = useState(false);
  const [reduce] = useState(() => (typeof window === 'undefined' ? false : reducedMotion()));

  // Counter tick: 120ms out, 180ms in (values swap under a fade if reduced).
  const [shownPos, setShownPos] = useState(pos + 1);
  const [tick, setTick] = useState<'idle' | 'out' | 'in'>('idle');

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const topCardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef(0);
  const gesture = useRef<{
    id: number; x: number; y: number; active: boolean; edge: boolean;
    captured: boolean; el: HTMLElement;
  } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const finishSoon = useRef(false);
  const closingRef = useRef(false);

  const later = useCallback((ms: number, fn: () => void) => {
    const t = setTimeout(fn, ms);
    timers.current.push(t);
    return t;
  }, []);

  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  // Focus in on open, back to the opener on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => { if (opener && opener.isConnected) opener.focus(); };
  }, []);

  useEffect(() => {
    if (reduce) return;
    const t = setTimeout(() => setDealt(true), 900);
    return () => clearTimeout(t);
  }, [reduce]);

  useEffect(() => {
    const target = pos + 1;
    if (target === shownPos) return;
    if (reduce) { setShownPos(target); return; }
    setTick('out');
    const t1 = setTimeout(() => { setShownPos(target); setTick('in'); }, 120);
    const t2 = setTimeout(() => setTick('idle'), 300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [pos, reduce, shownPos]);

  // Never leave an announcement hanging in the live region.
  useEffect(() => {
    if (!announce) return;
    const t = setTimeout(() => setAnnounce(''), 4000);
    return () => clearTimeout(t);
  }, [announce]);

  function pulseNav(target: HTMLElement) {
    target.classList.add('bank-nav-bump');
    const ring = document.createElement('span');
    ring.className = 'bank-splash-pulse pointer-events-none absolute inset-0 rounded-[18px] border-2 border-primary-container';
    target.appendChild(ring);
    later(280, () => { target.classList.remove('bank-nav-bump'); ring.remove(); });
  }

  /** The one X: shrink, fly to the visible Books nav item, pulse it, close.
   *  Unresolved cards stay in To review — closing changes no status. */
  const dismiss = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    const target = booksNavTarget();
    const sheet = dialogRef.current?.getBoundingClientRect();
    if (target && sheet) {
      const t = target.getBoundingClientRect();
      setFly({
        x: t.left + t.width / 2 - (sheet.left + sheet.width / 2),
        y: t.top + t.height / 2 - (sheet.top + sheet.height / 2),
      });
    }
    setClosing(true);
    if (target) later(reduce ? 0 : 300, () => pulseNav(target));
    later(reduce ? 0 : 460, onClose);
  }, [later, onClose, reduce]);

  /** Escape, the scrim and the edge swipe: plain slide down, no flight. */
  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    later(reduce ? 0 : 360, onClose);
  }, [later, onClose, reduce]);

  // A nav press closes the sheet with the slide-down (no card flight) and lets
  // the tab navigation through. The provider dispatches this on a captured
  // click, before Next handles the link (CHANGES.md · item 6).
  useEffect(() => {
    const onNavPress = () => requestClose();
    window.addEventListener('onit:bank-stack-close', onNavPress);
    return () => window.removeEventListener('onit:bank-stack-close', onNavPress);
  }, [requestClose]);

  const caught = filter === 'review' && pending === 0
    && state.items.length + deposits.length > 0;

  // All caught up dismisses itself after 1.9s, but only when the user just
  // finished the batch — not when the sheet is opened with nothing to do, and
  // never while Ignored holds items the owner may still want to restore.
  useEffect(() => {
    if (!caught || passed.length > 0 || !finishSoon.current) return;
    const t = setTimeout(dismiss, 1900);
    return () => clearTimeout(t);
  }, [caught, passed.length, dismiss]);

  function restoreExpense(item: BankItem) {
    dispatch({ type: 'restore', id: item.id });
    dispatch({ type: 'filter', filter: 'review' });
    setAnnounce('Back in To review.');
  }

  /** Restore on an ignored DEPOSIT: drop its 'ignored' link, then show it in
   *  To review again. A recorded payment or income row is never touched. */
  async function restoreDepositRow(deposit: ApiDeposit) {
    try {
      const res = await fetch(DEPOSITS_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(depositRestoreBody(deposit.id)),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setToast(depositRefusalMessage(body?.error));
        return;
      }
      setDeposits((rows) => restoreDeposit(rows, deposit.id));
      window.dispatchEvent(new Event(DEPOSITS_CHANGED));
      dispatch({ type: 'filter', filter: 'review' });
      setAnnounce('Back in To review.');
    } catch {
      setToast(depositRefusalMessage(null));
    }
  }

  const segClass = (on: boolean) =>
    `flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[10px] text-sm font-semibold transition-colors ${
      on ? 'bg-surface-container-lowest text-on-background shadow-sm' : 'text-on-surface-variant'
    }`;

  /** One step, never past either end. indexRef is the source of truth during a
   *  gesture, so a fast swipe can't reuse a stale position and land back on the
   *  same card (CHANGES.md · item 8). */
  const go = useCallback((dir: 1 | -1) => {
    const next = nextQueueIndex(queue.length, indexRef.current, dir);
    if (next === indexRef.current) return;
    indexRef.current = next;
    setIndex(next);
  }, [queue.length]);

  /** Money out: one dispatch. Money in: its card already wrote, so this only
   *  drops it from the queue and shows the confirmation. */
  const ranDeposit = useCallback((id: string, message: string, kind: string) => {
    if (queue.length === 1) finishSoon.current = true;
    setDeposits((rows) => resolveDeposit(rows, id, {
      kind: kind as 'recorded' | 'linked' | 'classified' | 'ignored' | 'stripe_payout',
      payment_id: null,
      classification: null,
    }));
    setToast(message);
    setAnnounce(message);
    window.dispatchEvent(new Event(DEPOSITS_CHANGED));
  }, [queue.length]);

  // One invariant for every queue change: add, ignore, restore. Position used to
  // be clamped only by the deposit path, so ignoring on card 4 and then
  // restoring reopened the strip on card 5 (CHANGES.md · item 4).
  useEffect(() => {
    setIndex((current) => Math.min(current, Math.max(0, queue.length - 1)));
  }, [queue.length]);

  const run = useCallback((action: CardAction) => {
    const entry = top;
    if (!entry || entry.kind !== 'expense' || leaving) return;
    const item = entry.item;
    const review = item.review;
    if (queue.length === 1) finishSoon.current = true;

    if (action === 'ignore') {
      setLeaving({ item, mode: 'left', step: 'exit', cover: null });
      dispatch({ type: 'ignore', id: item.id });
      setAnnounce("Don't add. Moved out of To review.");
      later(reduce ? 0 : 260, () => setLeaving(null));
      return;
    }

    if (action === 'already') {
      setLeaving({ item, mode: 'collapse', step: 'cover', cover: 'linked' });
      dispatch({ type: 'already', id: item.id });
      setAnnounce('Already recorded. Linked to your expense.');
      later(reduce ? 0 : 900, () => setLeaving(null));
      return;
    }

    // A receipt add writes before the card moves (advancesOptimistically): no
    // cover and no confirmation here. The card keeps its place and shows
    // "Adding…", and the provider reports the outcome.
    if (!advancesOptimistically({ type: action }, item)) {
      dispatch({ type: 'add', id: item.id });
      return;
    }

    // Add to record / Fix: cover in, then the card leaves upward.
    setLeaving({ item, mode: 'up', step: 'cover', cover: 'added' });
    dispatch({ type: 'add', id: item.id });
    setToast(review ? review.toast : addedToast(item.date));
    later(reduce ? 0 : 340, () => setLeaving((l) => (l ? { ...l, step: 'exit' } : l)));
    later(reduce ? 0 : 720, () => setLeaving(null));
  }, [top, leaving, queue.length, dispatch, later, reduce]);

  // ── Touch browse (touch only; pointer devices use ← / →) ──
  function onPointerDown(e: ReactPointerEvent) {
    if (e.pointerType !== 'touch' || reduce || !top || leaving || filter !== 'review') return;
    gesture.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      active: false,
      edge: e.clientX <= EDGE_CLOSE_PX,
      captured: false,
      el: e.currentTarget as HTMLElement,
    };
  }
  function onPointerMove(e: ReactPointerEvent) {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    // The left 24px is the back gesture, not a card browse: drag right and the
    // sheet closes exactly like Escape.
    if (g.edge && dx > 48 && Math.abs(dx) > Math.abs(dy)) {
      gesture.current = null;
      setDrag(0);
      dragRef.current = 0;
      requestClose();
      return;
    }
    if (!g.active) {
      if (Math.abs(dx) < 10) return;
      if (Math.abs(dy) > Math.abs(dx)) { gesture.current = null; return; }
      g.active = true;
      // Only now, once this is a sideways swipe, does the zone take the pointer.
      // Capturing on pointerdown would swallow the card's own taps (a captured
      // pointerup sends the click to the zone, not the button); without it a
      // release outside the zone never reached onPointerUp and left the card
      // parked mid-swipe (CHANGES.md · item 4).
      try { g.el.setPointerCapture(g.id); g.captured = true; } catch { /* no capture here */ }
      setDragging(true);
    }
    const atEdge = (pos === 0 && dx > 0) || (pos >= queue.length - 1 && dx < 0);
    dragRef.current = rubberBand(dx, atEdge);
    setDrag(dragRef.current);
  }
  function onPointerUp() {
    const g = gesture.current;
    gesture.current = null;
    if (!g?.active) { setDrag(0); dragRef.current = 0; return; }
    setDragging(false);
    const dx = dragRef.current;
    dragRef.current = 0;
    // Past the first card a right swipe rubber bands and springs home instead
    // of "committing" to the card already on top.
    if (Math.abs(dx) >= SWIPE_COMMIT_PX) {
      const dir: 1 | -1 = dx < 0 ? 1 : -1;
      if (nextQueueIndex(queue.length, indexRef.current, dir) !== indexRef.current) go(dir);
    }
    setDrag(0);
  }

  /** Capture can end without a pointerup: the card unmounts, or the OS takes the
   *  gesture. Land the strip back on the stack instead of leaving it offset. */
  function abandonGesture() {
    gesture.current = null;
    dragRef.current = 0;
    setDragging(false);
    setDrag(0);
  }

  // ── Keyboard: Escape, ← / →, and a focus trap ──
  function onKeyDown(e: ReactKeyboardEvent) {
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); requestClose(); return; }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName);
    if (!typing && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      go(e.key === 'ArrowRight' ? 1 : -1);
      return;
    }
    if (e.key !== 'Tab') return;
    const root = dialogRef.current;
    if (!root) return;
    const nodes = Array.from(root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((el) => el.getClientRects().length > 0 && !el.closest('[inert]'));
    if (!nodes.length) return;
    const first = nodes[0];
    const lastEl = nodes[nodes.length - 1];
    if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
  }

  /** One row in the Ignored tab, whichever side it came from. */
  function ignoredRow(entry: StackEntry) {
    const name = entry.kind === 'expense' ? entry.item.merchant : (entry.deposit.merchant || entry.deposit.name);
    const when = entry.kind === 'expense' ? formatDay(entry.item.date) : formatDay(entry.deposit.occurred_on);
    const where = entry.kind === 'expense' ? itemAccount(entry.item) : 'Bank deposit';
    const amount = entry.kind === 'expense'
      ? formatMoney(entry.item.amount)
      : formatMoney(entry.deposit.amount_cents / 100);
    return (
      <div key={`${entry.kind}-${entry.id}`} className="flex items-center gap-3 border-b border-outline-variant/40 px-3.5 py-2.5 last:border-b-0">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold">{name}</div>
          <div className="truncate text-[13px] text-on-surface-variant">{when} · {where}</div>
        </div>
        <span className="shrink-0 font-display text-[15px] font-bold tabular-nums">{amount}</span>
        <button
          type="button"
          onClick={() => (entry.kind === 'expense' ? restoreExpense(entry.item) : void restoreDepositRow(entry.deposit))}
          className="h-11 shrink-0 rounded-full border-[1.5px] border-outline-variant px-3.5 text-sm font-semibold transition-transform active:scale-[0.95]"
        >
          Restore
        </button>
      </div>
    );
  }

  const sheet = (
    <div data-bank-motion className="fixed inset-x-0 top-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-[85] flex items-end justify-center md:inset-0 md:bottom-0 md:items-center">
      <div
        aria-hidden
        onClick={requestClose}
        className="bank-fade absolute inset-0 hidden md:block"
        style={{ background: 'var(--oi-scrim)' }}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bank-activity-counter"
        data-kb-fit=""
        onKeyDown={onKeyDown}
        style={fly ? ({ '--fly-x': `${fly.x}px`, '--fly-y': `${fly.y}px` } as CSSProperties) : undefined}
        className={`relative flex h-[calc(100%-12px)] min-h-0 w-full flex-col overflow-hidden rounded-t-[var(--oi-radius-sheet)] bg-background shadow-[0_-12px_30px_-8px_rgba(52,40,12,.2)] md:h-[calc(100dvh-32px)] md:max-h-[680px] md:w-[440px] md:rounded-[var(--oi-radius-sheet)] md:shadow-card-raised ${
          closing ? 'bank-sheet-fly' : 'bank-sheet-up'
        }`}
      >
        <div aria-hidden className={`mx-auto mt-2 h-[5px] w-[38px] shrink-0 rounded-full bg-surface-dim md:hidden ${closing ? 'opacity-0' : ''}`} />

        <div className="flex h-[52px] shrink-0 items-center justify-between px-4">
          <button
            ref={closeRef}
            type="button"
            aria-label="Close bank activity"
            onClick={dismiss}
            className="grid h-11 w-11 place-items-center rounded-full bg-surface-container-high transition-transform active:scale-[0.9]"
          >
            <Icon name="close" size={22} />
          </button>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[11px] font-bold uppercase tracking-[.16em] text-on-surface-variant">Bank activity</span>
            <div id="bank-activity-counter" aria-live="polite" aria-atomic="true" className="h-[22px] overflow-hidden">
              {filter === 'ignored' ? (
                <span className="block font-display text-[18px] font-extrabold leading-[22px]">Ignored</span>
              ) : pending > 0 ? (
                <>
                  <span className="sr-only">Item {pos + 1} of {queue.length}</span>
                  <span
                    aria-hidden
                    className={`block font-display text-[18px] font-extrabold leading-[22px] tabular-nums ${
                      tick === 'out' ? 'bank-tick-out' : tick === 'in' ? 'bank-tick-in' : ''
                    }`}
                  >
                    {counterLabel(shownPos, queue.length)}
                  </span>
                </>
              ) : (
                <span className="block font-display text-[18px] font-extrabold leading-[22px]">Bank activity</span>
              )}
            </div>
          </div>
          <span aria-hidden className="h-11 w-11" />
        </div>

        {/* CHANGES.md · item 5: the toast lives here, right under the counter,
            in flow so it can never cover the card's action buttons. */}
        {toast && (
          <div className="mx-4 mb-2 shrink-0">
            <BankToast message={toast} onDone={() => setToast(null)} />
          </div>
        )}

        {/* Two tabs, always (CHANGES.md · item 2). Ignored shows its own count
            but never enters the counter above. */}
        <div role="group" aria-label="Bank activity filter" className="mx-4 mb-3 flex shrink-0 gap-1 rounded-[14px] bg-surface-container-high p-1">
          <button type="button" aria-pressed={filter === 'review'} onClick={() => dispatch({ type: 'filter', filter: 'review' })} className={segClass(filter === 'review')}>
            To review
            <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-[12px] font-semibold text-on-surface-variant">{pending}</span>
          </button>
          <button type="button" aria-pressed={filter === 'ignored'} onClick={() => dispatch({ type: 'filter', filter: 'ignored' })} className={segClass(filter === 'ignored')}>
            Ignored
            <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-[12px] font-semibold text-on-surface-variant">{passed.length}</span>
          </button>
        </div>

        {/* Page dots live in the header stack, never over the card buttons. */}
        {filter === 'review' && queue.length > 1 && (
          <div className="mb-2 flex h-[10px] shrink-0 items-center justify-center gap-1.5" aria-hidden>
            {dotStart > 0 && <span className="h-1 w-1 rounded-full bg-outline-variant/60" />}
            {Array.from({ length: dotCount }, (_, i) => dotStart + i).map((i) => (
              <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === pos ? 'bg-primary-container' : 'bg-outline-variant'}`} />
            ))}
            {dotStart + dotCount < queue.length && <span className="h-1 w-1 rounded-full bg-outline-variant/60" />}
          </div>
        )}

        <div
          className="relative mx-4 mb-3 min-h-0 flex-1 overflow-hidden"
          style={{ touchAction: 'pan-y' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onLostPointerCapture={abandonGesture}
        >
          {filter === 'ignored' ? (
            // Same height as To review: the pane owns the whole card zone and
            // the list scrolls inside it, so switching tabs never resizes the
            // sheet and the empty state sits in the middle of it
            // (CHANGES.md · item 7).
            <div className="bank-fade absolute inset-0 flex flex-col overflow-hidden rounded-[var(--oi-radius-card)] border border-outline-variant/70 bg-surface-container-lowest">
              {passed.length === 0 ? (
                <p className="grid flex-1 place-items-center px-6 text-center text-sm text-on-surface-variant">
                  Nothing ignored. Cards you pass on land here.
                </p>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  {passed.map(ignoredRow)}
                </div>
              )}
            </div>
          ) : pending === 0 ? (
            caught ? (
              <div className="bank-fade flex h-full flex-col items-center justify-center gap-3.5 px-7 pb-16 text-center">
                <svg width="120" height="120" viewBox="0 0 120 120" className="text-primary-container" aria-hidden>
                  <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" strokeOpacity=".35" strokeWidth="5" />
                  <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round"
                    strokeDasharray="315" className="bank-caught-ring" style={{ '--dash': '315', transform: 'rotate(-90deg)', transformOrigin: '60px 60px' } as CSSProperties} />
                  <polyline points="40,62 54,76 82,46" fill="none" stroke="#1f1b13" strokeWidth="6" strokeLinecap="round"
                    strokeLinejoin="round" strokeDasharray="64" className="bank-caught-check" style={{ '--dash': '64' } as CSSProperties} />
                </svg>
                <h3 className="font-display text-[26px] font-extrabold">All caught up</h3>
                <p className="text-[15px] leading-[1.45] text-on-surface-variant">
                  {passed.length > 0
                    ? 'Everything left is in Ignored — restore any you still need.'
                    : 'Every bank item is accounted for.'}
                </p>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-8 pb-16 text-center">
                <span aria-hidden className="grid h-[72px] w-[72px] place-items-center rounded-[24px] bg-primary-soft">
                  <Icon name="account_balance" size={34} />
                </span>
                <h3 className="font-display text-[22px] font-extrabold">No new bank activity</h3>
                <p className="text-[15px] leading-[1.45] text-on-surface-variant">
                  On It checks your bank through the day. New charges and deposits land here.
                </p>
              </div>
            )
          ) : (
            <>
              {queue.slice(pos, pos + 3).map((entry, depth) => {
                const isTop = depth === 0;
                return (
                  <div
                    key={`${entry.kind}-${entry.id}`}
                    ref={isTop ? topCardRef : undefined}
                    className={STACK_CARD_SLOT}
                    style={{
                      zIndex: 30 - depth,
                      transform: isTop ? swipeTransform(drag, reduce || !dragging) : undefined,
                      transition: isTop && !dragging ? 'transform 460ms var(--oi-spring)' : undefined,
                      pointerEvents: isTop ? 'auto' : 'none',
                    }}
                  >
                    <div
                      className={`h-full ${isTop ? (dealt || reduce ? '' : 'bank-deal') : depth === 1 ? 'bank-peek-1' : 'bank-peek-2'}`}
                      style={!dealt && !reduce && depth < 3 ? ({ '--deal-n': depth } as CSSProperties) : undefined}
                    >
                      {isTop ? (
                        entry.kind === 'deposit' ? (
                          <DepositCard
                            deposit={entry.deposit}
                            invoices={moneyIn.invoices}
                            payments={moneyIn.payments}
                            headingRef={headingRef}
                            onResolved={ranDeposit}
                          />
                        ) : (
                          <ReviewCard
                            item={entry.item}
                            account={itemAccount(entry.item)}
                            headingRef={headingRef}
                            busy={busyIds.includes(entry.item.id)}
                            error={refused && refused.id === entry.item.id ? refused.message : null}
                            onAction={run}
                            onPatch={(patch) => dispatch({ type: 'edit', id: entry.item.id, patch })}
                          />
                        )
                      ) : (
                        <div aria-hidden ref={(el) => { el?.setAttribute('inert', ''); }} className="h-full">
                          {entry.kind === 'deposit' ? (
                            <DepositCard
                              deposit={entry.deposit}
                              invoices={moneyIn.invoices}
                              payments={moneyIn.payments}
                              onResolved={() => {}}
                            />
                          ) : (
                            <ReviewCard
                              item={entry.item}
                              account={itemAccount(entry.item)}
                              onAction={() => {}}
                              onPatch={() => {}}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

            </>
          )}

          {/* Money out keeps its exit animation; a deposit is gone the moment
              its write lands (its own card owns the busy state). */}
          {leaving && (
            <div className="pointer-events-none absolute inset-0 z-40" aria-hidden>
              <div
                className={`absolute inset-0 ${
                  leaving.mode === 'left' ? 'bank-fade-left'
                    : leaving.mode === 'collapse' ? 'bank-collapse-right'
                    : leaving.step === 'exit' ? 'bank-card-out-up' : ''
                }`}
              >
                <ReviewCard
                  item={leaving.item}
                  account={itemAccount(leaving.item)}
                  cover={leaving.cover}
                  onAction={() => {}}
                  onPatch={() => {}}
                />
              </div>
            </div>
          )}
        </div>

        {/* Pointer-only prev/next. It belongs to the sheet, so every card type
            gets it (stack-nav.test.ts); touch browses by swiping. */}
        <StackNav kind={cardKindOf(top)} pending={pending} pos={pos} filter={filter} onStep={go} />

        <p role="status" aria-live="polite" className="sr-only">{announce}</p>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
