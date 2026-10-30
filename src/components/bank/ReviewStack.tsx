'use client';
// ═══ Review stack ═══
// A full-screen sheet on phones, a centred 440px dialog from 768px up, over a
// scrim. One stack of cards: drag sideways to browse, act on the front card.
//
// Structural rules this file keeps (SPEC.txt):
//   · role="dialog" aria-modal, labelled by the counter; Escape closes and
//     focus returns to whatever opened it.
//   · Focus order: X → filter → top card … → card X; the peeks are inert.
//   · "3 of 7" is aria-live and announces "Item 3 of 7".
//   · Swipe is touch-only and rubber-banded at the ends; ← / → and the
//     on-screen prev/next buttons (pointer devices) are the keyboard path.
//   · X flies the card to whichever Books nav item is visible and pulses it.
//   · Reduced motion: no flight, no springs, no count-up; each action is one
//     fade and the card is simply gone.
//
// No Supabase, no fetch: every action is one dispatch into fixture state.
import { useCallback, useEffect, useRef, useState, type CSSProperties, type Dispatch, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/Icon';
import BankToast from './BankToast';
import ReviewCard, { type CardAction } from './ReviewCard';
import { reducedMotion } from '@/lib/list-motion';
import {
  accountLabel, addedToast, counterLabel, formatDay, formatMoney, hiddenQueue, nextQueueIndex,
  reviewQueue, rubberBand, SWIPE_COMMIT_PX, swipeTransform,
  type BankAction, type BankItem, type BankReviewState,
} from '@/lib/bank-tracking';

type Leaving = {
  item: BankItem;
  mode: 'up' | 'left' | 'collapse' | 'fly';
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

export default function ReviewStack({
  state, dispatch, onClose,
}: {
  state: BankReviewState;
  dispatch: Dispatch<BankAction>;
  onClose: () => void;
}) {
  const queue = reviewQueue(state);
  const hidden = hiddenQueue(state);
  const pending = queue.length;
  const filter = state.filter;
  const [index, setIndex] = useState(0);
  const pos = Math.min(index, Math.max(0, queue.length - 1));
  const top = queue[pos] ?? null;

  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState<Leaving | null>(null);
  const [fly, setFly] = useState<{ x: number; y: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
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
  const gesture = useRef<{ id: number; x: number; y: number; active: boolean } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const finishSoon = useRef(false);

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

  const requestClose = useCallback(() => {
    if (closing) return;
    if (reduce) { onClose(); return; }
    setClosing(true);
    later(360, onClose);
  }, [closing, later, onClose, reduce]);

  const caught = filter === 'review' && pending === 0 && state.items.length > 0;

  // All caught up dismisses itself after 1.9s, but only when the user just
  // finished the batch — not when the sheet is opened with nothing to do.
  useEffect(() => {
    if (!caught || !finishSoon.current) return;
    const t = setTimeout(requestClose, 1900);
    return () => clearTimeout(t);
  }, [caught, requestClose]);

  const go = useCallback((dir: 1 | -1) => {
    setIndex(nextQueueIndex(queue.length, pos, dir));
  }, [queue.length, pos]);

  function pulseNav(target: HTMLElement) {
    target.classList.add('bank-nav-bump');
    const ring = document.createElement('span');
    ring.className = 'bank-splash-pulse pointer-events-none absolute inset-0 rounded-[18px] border-2 border-primary-container';
    target.appendChild(ring);
    later(280, () => { target.classList.remove('bank-nav-bump'); ring.remove(); });
  }

  const run = useCallback((action: CardAction) => {
    const item = top;
    if (!item || leaving) return;
    const review = item.review;
    if (queue.length === 1) finishSoon.current = true;

    if (action === 'hide') {
      const target = booksNavTarget();
      const card = topCardRef.current?.getBoundingClientRect();
      if (target && card) {
        const t = target.getBoundingClientRect();
        setFly({
          x: t.left + t.width / 2 - (card.left + card.width / 2),
          y: t.top + t.height / 2 - (card.top + card.height / 2),
        });
      }
      setLeaving({ item, mode: 'fly', step: 'exit', cover: null });
      dispatch({ type: 'hide', id: item.id });
      setAnnounce('Hidden. In Books under Unaccounted for.');
      later(reduce ? 0 : 460, () => { if (target) pulseNav(target); });
      later(reduce ? 0 : 520, () => { setLeaving(null); setFly(null); });
      later(60, () => headingRef.current?.focus());
      return;
    }

    if (action === 'ignore') {
      setLeaving({ item, mode: 'left', step: 'exit', cover: null });
      dispatch({ type: 'ignore', id: item.id });
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
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, active: false };
  }
  function onPointerMove(e: ReactPointerEvent) {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.active) {
      if (Math.abs(dx) < 10) return;
      if (Math.abs(dy) > Math.abs(dx)) { gesture.current = null; return; }
      g.active = true;
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
    if (Math.abs(dx) >= SWIPE_COMMIT_PX) go(dx < 0 ? 1 : -1);
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

  function restoreHidden(item: BankItem) {
    const reopened: BankReviewState = { ...state, status: { ...state.status, [item.id]: 'open' } };
    const at = reviewQueue(reopened).findIndex((it) => it.id === item.id);
    dispatch({ type: 'unhide', id: item.id });
    dispatch({ type: 'filter', filter: 'review' });
    setIndex(Math.max(0, at));
    setAnnounce('Back in the stack.');
  }

  const segClass = (on: boolean) =>
    `flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[10px] text-sm font-semibold transition-colors ${
      on ? 'bg-surface-container-lowest text-on-background shadow-sm' : 'text-on-surface-variant'
    }`;

  const sheet = (
    <div data-bank-motion className="fixed inset-x-0 top-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-[85] flex items-end justify-center md:inset-0 md:bottom-0">
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
        className={`relative flex h-full w-full flex-col overflow-hidden rounded-t-[var(--oi-radius-sheet)] bg-background shadow-[0_-12px_30px_-8px_rgba(52,40,12,.2)] md:h-auto md:max-h-[86vh] md:w-[440px] md:rounded-[var(--oi-radius-sheet)] md:shadow-card-raised ${
          closing ? 'bank-sheet-down' : 'bank-sheet-up'
        }`}
      >
        <div aria-hidden className={`mx-auto mt-2 h-[5px] w-[38px] shrink-0 rounded-full bg-surface-dim md:hidden ${closing ? 'opacity-0' : ''}`} />

        <div className="flex h-[52px] shrink-0 items-center justify-between px-4">
          <button
            ref={closeRef}
            type="button"
            aria-label="Close bank activity"
            onClick={requestClose}
            className="grid h-11 w-11 place-items-center rounded-full bg-surface-container-high transition-transform active:scale-[0.9]"
          >
            <Icon name="close" size={22} />
          </button>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[11px] font-bold uppercase tracking-[.16em] text-on-surface-variant">Bank activity</span>
            <div id="bank-activity-counter" aria-live="polite" aria-atomic="true" className="h-[22px] overflow-hidden">
              {filter === 'review' && pending > 0 ? (
                <>
                  <span className="sr-only">Item {pos + 1} of {state.items.length}</span>
                  <span
                    aria-hidden
                    className={`block font-display text-[18px] font-extrabold leading-[22px] tabular-nums ${
                      tick === 'out' ? 'bank-tick-out' : tick === 'in' ? 'bank-tick-in' : ''
                    }`}
                  >
                    {counterLabel(shownPos, state.items.length)}
                  </span>
                </>
              ) : (
                <span className="block font-display text-[18px] font-extrabold leading-[22px]">
                  {filter === 'hidden' ? 'Hidden' : 'Bank activity'}
                </span>
              )}
            </div>
          </div>
          <span aria-hidden className="h-11 w-11" />
        </div>

        <div role="group" aria-label="Filter bank activity" className="mx-4 mb-3 flex shrink-0 gap-1 rounded-[14px] bg-surface-container-high p-1">
          <button type="button" aria-pressed={filter === 'review'} onClick={() => dispatch({ type: 'filter', filter: 'review' })} className={segClass(filter === 'review')}>
            To review
            <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-[12px] font-semibold text-on-surface-variant">{pending}</span>
          </button>
          <button type="button" aria-pressed={filter === 'hidden'} onClick={() => dispatch({ type: 'filter', filter: 'hidden' })} className={segClass(filter === 'hidden')}>
            Hidden
            <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-[12px] font-semibold text-on-surface-variant">{hidden.length}</span>
          </button>
        </div>

        <div
          className="relative mx-4 min-h-0 flex-1"
          style={{ touchAction: 'pan-y' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {filter === 'hidden' ? (
            hidden.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-8 pb-12 text-center">
                <span aria-hidden className="grid h-16 w-16 place-items-center rounded-[22px] bg-surface-container-high">
                  <Icon name="visibility_off" size={30} />
                </span>
                <div className="font-display text-xl font-extrabold">Nothing hidden</div>
                <p className="text-[15px] leading-[1.45] text-on-surface-variant">
                  Anything you hide waits here and stays in Books under Unaccounted for.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-[var(--oi-radius-card)] border border-outline-variant/70 bg-surface-container-lowest">
                {hidden.map((item) => (
                  <div key={item.id} className="bank-fade flex items-center gap-3 border-b border-outline-variant/40 px-3.5 py-3 last:border-b-0">
                    <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-surface-container-high font-display text-base font-extrabold">
                      {item.merchant.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-base font-semibold">{item.merchant}</div>
                      <div className="truncate text-[13px] text-on-surface-variant">
                        {formatDay(item.date)} · {accountLabel(item.accountId)}
                      </div>
                    </div>
                    <span className="shrink-0 font-display text-[15px] font-bold tabular-nums">{formatMoney(item.amount)}</span>
                    <button
                      type="button"
                      onClick={() => restoreHidden(item)}
                      className="h-11 shrink-0 rounded-full border-[1.5px] border-outline-variant px-3.5 text-sm font-semibold transition-transform active:scale-[0.95]"
                    >
                      Review
                    </button>
                  </div>
                ))}
              </div>
            )
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
                  {hidden.length > 0
                    ? 'Everything else is hidden. Hidden items stay in Books under Unaccounted for.'
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
                  On It checks your bank through the day. New charges land here.
                </p>
              </div>
            )
          ) : (
            <>
              {queue.slice(pos, pos + 3).map((item, depth) => {
                const isTop = depth === 0;
                return (
                  <div
                    key={item.id}
                    ref={isTop ? topCardRef : undefined}
                    className="absolute inset-0"
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
                        <ReviewCard
                          item={item}
                          account={accountLabel(item.accountId)}
                          headingRef={headingRef}
                          onAction={run}
                          onPatch={(patch) => dispatch({ type: 'edit', id: item.id, patch })}
                        />
                      ) : (
                        <div aria-hidden ref={(el) => { el?.setAttribute('inert', ''); }} className="h-full">
                          <ReviewCard
                            item={item}
                            account={accountLabel(item.accountId)}
                            onAction={() => {}}
                            onPatch={() => {}}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {queue.length > 1 && (
                <div className="pointer-events-none absolute -bottom-1 left-1/2 z-40 flex -translate-x-1/2 gap-1.5" aria-hidden>
                  {queue.slice(0, Math.min(queue.length, 6)).map((item, i) => (
                    <span key={item.id} className={`h-1.5 w-1.5 rounded-full ${i === pos ? 'bg-primary-container' : 'bg-outline-variant'}`} />
                  ))}
                </div>
              )}
            </>
          )}

          {leaving && (
            <div className="pointer-events-none absolute inset-0 z-40" aria-hidden>
              <div
                className={`absolute inset-0 ${
                  leaving.mode === 'fly' ? 'bank-fly'
                    : leaving.mode === 'left' ? 'bank-fade-left'
                    : leaving.mode === 'collapse' ? 'bank-collapse-right'
                    : leaving.step === 'exit' ? 'bank-card-out-up' : ''
                }`}
                style={leaving.mode === 'fly' && fly ? ({ '--fly-x': `${fly.x}px`, '--fly-y': `${fly.y}px` } as CSSProperties) : undefined}
              >
                <ReviewCard
                  item={leaving.item}
                  account={accountLabel(leaving.item.accountId)}
                  cover={leaving.cover}
                  onAction={() => {}}
                  onPatch={() => {}}
                />
              </div>
              {leaving.mode === 'fly' && (
                <span
                  className="bank-ring-fly absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-primary-container"
                  style={fly ? ({ '--fly-x': `${fly.x}px`, '--fly-y': `${fly.y}px` } as CSSProperties) : undefined}
                />
              )}
            </div>
          )}
        </div>

        {/* Pointer-only prev/next (touch browses by swiping). Kept after the
            stack so the documented focus order inside a card is untouched. */}
        <div className="hidden shrink-0 items-center justify-center gap-2 pb-2 pt-3 [@media(hover:hover)]:flex">
          <button
            type="button"
            aria-label="Previous item"
            aria-keyshortcuts="ArrowLeft"
            disabled={filter !== 'review' || pending === 0 || pos === 0}
            onClick={() => go(-1)}
            className="grid h-11 w-11 place-items-center rounded-full border border-outline-variant bg-surface-container-lowest disabled:opacity-40"
          >
            <Icon name="arrow_back" size={20} />
          </button>
          <button
            type="button"
            aria-label="Next item"
            aria-keyshortcuts="ArrowRight"
            disabled={filter !== 'review' || pending === 0 || pos >= pending - 1}
            onClick={() => go(1)}
            className="grid h-11 w-11 place-items-center rounded-full border border-outline-variant bg-surface-container-lowest disabled:opacity-40"
          >
            <Icon name="arrow_forward" size={20} />
          </button>
        </div>

        {toast && (
          <div className="pointer-events-none absolute inset-x-4 bottom-4 z-50">
            <BankToast message={toast} onDone={() => setToast(null)} />
          </div>
        )}

        <p role="status" aria-live="polite" className="sr-only">{announce}</p>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
