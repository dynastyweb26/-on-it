'use client';
// The five-panel tab deck. It owns the horizontal gesture, the panel track,
// per-page dimming and the reduced-motion crossfade. The route path remains the
// source of truth for the committed tab; the deck only previews the neighbour
// while the finger is down.
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { TABS } from '@/lib/tabs';
import {
  NAV_GUARD_MS,
  applyEdgeResistance,
  classifyAxis,
  dragFromLock,
  pageDim,
  settleDuration,
  tabCommitDirection,
  tabProgress,
} from '@/lib/swipe';
import { swipeBlockedAt } from '@/lib/swipe-dom';
import TabScroller from './TabScroller';
import { COMMIT_EASE, COMMIT_MS, SPRING_EASE, markTabGestureNavigation } from './tab-motion';

const ClientsView = dynamic(() => import('./ClientsView'), { loading: () => null });
const InvoicesView = dynamic(() => import('./InvoicesView'), { loading: () => null });
const ChatView = dynamic(() => import('./ChatView'), { loading: () => null });
const BooksView = dynamic(() => import('./BooksView'), { loading: () => null });
const SettingsTab = dynamic(() => import('./SettingsTab'), { loading: () => null });

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

type Sample = { x: number; t: number };

type Gesture = {
  id: number;
  startX: number;
  startY: number;
  axis: 'pending' | 'horizontal' | 'vertical';
  locked: boolean;
  /** dx at the horizontal lock; drag offsets are measured from here. */
  lockDx: number;
  /** The latest raw finger dx, for the flick distance gate. */
  fingerDx: number;
  offset: number;
  samples: Sample[];
};

type PillStart = (activeIndex: number) => void;
type PillMove = (progress: number) => void;
type PillEnd = (target: number | null, durationMs: number) => void;

export default function TabDeck({
  activeIndex,
  connectEnabled,
  subscriptionsEnabled,
  onPillStart,
  onPillMove,
  onPillEnd,
}: {
  activeIndex: number;
  connectEnabled: boolean;
  subscriptionsEnabled: boolean;
  onPillStart: PillStart;
  onPillMove: PillMove;
  onPillEnd: PillEnd;
}) {
  const router = useRouter();
  const reduced = usePrefersReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  const deckRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  /** One scrim for the whole deck; its opacity is the only dim write per move. */
  const dimRef = useRef<HTMLDivElement>(null);
  const dimTokenRef = useRef(0);
  const widthRef = useRef(0);
  const baseIndexRef = useRef(activeIndex);
  const currentIndexRef = useRef(activeIndex);
  const offsetRef = useRef(0);
  const gestureRef = useRef<Gesture | null>(null);
  const trackAnimRef = useRef<Animation | null>(null);
  const swapAnimRef = useRef<Animation | null>(null);
  const settlingRef = useRef<{ target: number } | null>(null);
  const navigatingRef = useRef<number | null>(null);

  const [currentIndex, setCurrentIndex] = useState(activeIndex);
  const [mounted, setMounted] = useState<Set<number>>(() => new Set([activeIndex]));
  const mountedRef = useRef(mounted);
  mountedRef.current = mounted;
  // SSR/pre-hydration origin. This intentionally never changes: React must not
  // overwrite the resting margin while a settle is animating the track.
  const [initialMargin] = useState(() => `${-activeIndex * 100}%`);

  // If the deck unmounts mid-gesture (a nested route wins), release the pill's
  // drag flag so the next tab navigation can still measure and place it.
  useEffect(() => () => onPillEnd(null, 0), [onPillEnd]);

  const ensureMounted = useCallback((i: number) => {
    if (i < 0 || i >= TABS.length) return;
    setMounted((prev) => {
      if (prev.has(i)) return prev;
      const next = new Set(prev);
      next.add(i);
      return next;
    });
  }, []);

  // Prewarmed pages stay mounted but are not painted: `visibility` takes them
  // out of the compositor without losing their layout or React tree. The deck
  // reveals one neighbour at lock, and the other only if the finger reverses.
  // This keeps the 500%-wide track's paint cost close to a single page.
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  const showSection = useCallback((i: number) => {
    const el = sectionRefs.current[i];
    if (el && el.style.visibility !== 'visible') el.style.visibility = 'visible';
  }, []);
  const syncVisible = useCallback((active: number) => {
    for (let i = 0; i < TABS.length; i++) {
      const el = sectionRefs.current[i];
      if (el) el.style.visibility = i === active ? 'visible' : 'hidden';
    }
  }, []);
  const showNeighbour = useCallback((dir: -1 | 1) => {
    const i = baseIndexRef.current + dir;
    if (i >= 0 && i < TABS.length) showSection(i);
  }, [showSection]);

  // A prewarmed page becomes visible only when it is the settled tab or a
  // gesture target. Keep it hidden while idle so it costs no compositor work.
  useIsoLayoutEffect(() => {
    if (!gestureRef.current && !settlingRef.current) syncVisible(baseIndexRef.current);
  }, [mounted, syncVisible]);

  // Mount the two neighbouring tabs while the browser is idle, one at a time.
  // The first horizontal move used to mount a neighbour synchronously, which
  // put its JS chunk, React render and (for Books) its first query inside the
  // gesture. Two staggered idle callbacks keep that work off the first paint
  // and off the drag; a cold swipe still falls back to a mount at touchstart.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const neighbours = [activeIndex - 1, activeIndex + 1]
      .filter((i) => i >= 0 && i < TABS.length && !mountedRef.current.has(i));
    if (neighbours.length === 0) return;
    let cancelled = false;
    let idleId: number | null = null;
    let next = 0;
    const timers: number[] = [];
    const idleWindow = window as Window & {
      requestIdleCallback?: (cb: IdleRequestCallback, opts?: IdleRequestOptions) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const scheduleIdle = (cb: () => void) => {
      if (idleWindow.requestIdleCallback) return idleWindow.requestIdleCallback(() => cb(), { timeout: 900 });
      return window.setTimeout(cb, 180);
    };
    const cancelIdle = (id: number) => {
      if (idleWindow.cancelIdleCallback) idleWindow.cancelIdleCallback(id);
      else window.clearTimeout(id);
    };
    const run = () => {
      if (cancelled || next >= neighbours.length) return;
      const target = neighbours[next++];
      idleId = scheduleIdle(() => {
        idleId = null;
        if (cancelled) return;
        ensureMounted(target);
        timers.push(window.setTimeout(run, 180));
      });
    };
    // Let the active tab's own first paint and data effect get a head start.
    timers.push(window.setTimeout(run, 420));
    return () => {
      cancelled = true;
      if (idleId !== null) cancelIdle(idleId);
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [activeIndex, ensureMounted]);

  const trackX = useCallback(() => {
    const track = trackRef.current;
    const fallback = -(baseIndexRef.current * widthRef.current) + offsetRef.current;
    if (!track) return fallback;
    const transform = window.getComputedStyle(track).transform;
    if (!transform || transform === 'none') return fallback;
    try {
      const matrix = new DOMMatrixReadOnly(transform);
      return Number.isFinite(matrix.m41) ? matrix.m41 : fallback;
    } catch {
      return fallback;
    }
  }, []);

  const paintTrack = useCallback((x: number) => {
    const track = trackRef.current;
    if (track) track.style.transform = `translate3d(${x}px, 0, 0)`;
  }, []);

  // At rest the track is offset with a layout margin, never a transform:
  // a transformed ancestor becomes the containing block for fixed descendants
  // (and starts a stacking context), which would trap the composer menu, sheets
  // and keypads below the portaled scrim. Motion properties exist only while a
  // finger is down or the committed settle is running.
  const setRestOffset = useCallback((index: number) => {
    const track = trackRef.current;
    if (!track) return;
    const w = widthRef.current;
    track.style.transition = 'none';
    track.style.removeProperty('transform');
    track.style.removeProperty('will-change');
    track.style.marginLeft = w > 0 ? `${-index * w}px` : `${-index * 100}%`;
  }, []);

  // Swap the resting margin for an equivalent transform before the first
  // painted drag/settle frame. Both writes are synchronous, so the track does
  // not move; later per-move writes only touch transform. The drag passes a
  // computed origin so lock() does not read layout inside touchmove.
  const beginTrackMotion = useCallback((origin?: number) => {
    const track = trackRef.current;
    const w = widthRef.current;
    if (!track || !w) return;
    const x = origin ?? -baseIndexRef.current * w + offsetRef.current;
    track.style.transition = 'none';
    track.style.marginLeft = '0px';
    track.style.willChange = 'transform';
    track.style.transform = `translate3d(${x}px, 0, 0)`;
  }, []);

  const clearDim = useCallback((durationMs = 0) => {
    const token = ++dimTokenRef.current;
    const el = dimRef.current;
    if (!el) return;
    if (durationMs > 0) {
      el.style.transition = `opacity ${durationMs}ms ease`;
      el.style.opacity = '0';
      window.setTimeout(() => {
        if (dimTokenRef.current !== token) return;
        el.style.transition = 'none';
        el.style.opacity = '0';
        el.style.removeProperty('will-change');
      }, durationMs + 40);
    } else {
      el.style.transition = 'none';
      el.style.opacity = '0';
      el.style.removeProperty('will-change');
    }
  }, []);

  const cancelTrackAnim = useCallback(() => {
    if (trackAnimRef.current) {
      // Freeze the visual position before cancel() drops the WAAPI effect, so
      // an interrupted settle does not snap back to its old origin.
      const x = trackX();
      trackAnimRef.current.cancel();
      trackAnimRef.current = null;
      paintTrack(x);
    }
    if (swapAnimRef.current) {
      swapAnimRef.current.cancel();
      swapAnimRef.current = null;
    }
    if (deckRef.current) deckRef.current.style.opacity = '1';
  }, [paintTrack, trackX]);

  const finishSettle = useCallback((target: number) => {
    baseIndexRef.current = target;
    offsetRef.current = 0;
    currentIndexRef.current = target;
    setCurrentIndex(target);
    ensureMounted(target);
    setRestOffset(target);
    syncVisible(target);
    clearDim();
    settlingRef.current = null;
  }, [clearDim, ensureMounted, setRestOffset, syncVisible]);

  const animateTrack = useCallback((toX: number, durationMs: number, easing: string, done: () => void) => {
    const track = trackRef.current;
    if (!track || durationMs <= 0) {
      paintTrack(toX);
      done();
      return;
    }
    const fromX = trackX();
    track.style.transition = 'none';
    const anim = track.animate(
      [{ transform: `translate3d(${fromX}px, 0, 0)` }, { transform: `translate3d(${toX}px, 0, 0)` }],
      { duration: durationMs, easing, fill: 'forwards' },
    );
    trackAnimRef.current = anim;
    anim.onfinish = () => {
      anim.cancel();
      trackAnimRef.current = null;
      paintTrack(toX);
      done();
    };
    anim.oncancel = () => { trackAnimRef.current = null; };
  }, [paintTrack, trackX]);

  const startSettle = useCallback((target: number, durationMs: number, push: boolean) => {
    if (target < 0 || target >= TABS.length) return;
    // Both pages must paint during the slide; the old one disappears only
    // once the track has landed.
    showSection(baseIndexRef.current);
    showSection(target);
    const from = trackX();
    cancelTrackAnim();
    beginTrackMotion(from);
    settlingRef.current = { target };
    currentIndexRef.current = target;
    setCurrentIndex(target);
    ensureMounted(target);
    clearDim(durationMs);
    onPillEnd(target, durationMs);
    animateTrack(-target * widthRef.current, durationMs, COMMIT_EASE, () => finishSettle(target));
    if (push) {
      markTabGestureNavigation();
      navigatingRef.current = Date.now();
      router.push(TABS[target].href);
    }
  }, [animateTrack, beginTrackMotion, cancelTrackAnim, clearDim, ensureMounted, finishSettle, onPillEnd, router, showSection, trackX]);

  const reducedSwap = useCallback((target: number, push: boolean) => {
    if (target < 0 || target >= TABS.length) return;
    showSection(target);
    cancelTrackAnim();
    settlingRef.current = { target };
    const deck = deckRef.current;
    if (!deck) {
      onPillEnd(target, 0);
      finishSettle(target);
      if (push) {
        markTabGestureNavigation();
        navigatingRef.current = Date.now();
        router.push(TABS[target].href);
      }
      return;
    }
    const out = deck.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: 'ease', fill: 'forwards' });
    swapAnimRef.current = out;
    out.onfinish = () => {
      out.cancel();
      swapAnimRef.current = null;
      baseIndexRef.current = target;
      currentIndexRef.current = target;
      setCurrentIndex(target);
      ensureMounted(target);
      offsetRef.current = 0;
      setRestOffset(target);
      syncVisible(target);
      clearDim();
      onPillEnd(target, 0);
      if (push) {
        markTabGestureNavigation();
        navigatingRef.current = Date.now();
        router.push(TABS[target].href);
      }
      const incoming = deck.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease', fill: 'forwards' });
      swapAnimRef.current = incoming;
      incoming.onfinish = () => {
        incoming.cancel();
        swapAnimRef.current = null;
        deck.style.opacity = '1';
        settlingRef.current = null;
      };
    };
  }, [cancelTrackAnim, clearDim, ensureMounted, finishSettle, onPillEnd, router, setRestOffset, showSection, syncVisible, trackX]);

  // Track origin: the route's tab on mount, then the deck's settled target.
  useIsoLayoutEffect(() => {
    const deck = deckRef.current;
    if (!deck) return;
    const measure = () => {
      const w = deck.getBoundingClientRect().width;
      if (!w) return;
      widthRef.current = w;
      if (!gestureRef.current && !settlingRef.current) {
        setRestOffset(baseIndexRef.current);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(deck);
    return () => ro.disconnect();
  }, [setRestOffset]);

  // A tab tap or browser history change: the path moved without a drag. Run
  // before paint so the track and the pill (also a layout effect) start on the
  // same frame.
  useIsoLayoutEffect(() => {
    if (activeIndex === currentIndexRef.current) {
      // A drag already set the logical target before the path caught up. Keep
      // settlingRef until the track animation finishes; it guards the resize
      // observer from snapping the track back to the old origin mid-flight.
      navigatingRef.current = null;
      return;
    }
    if (settlingRef.current?.target === activeIndex) {
      // The drag already started this settle; the path just caught up.
      navigatingRef.current = null;
      return;
    }
    // A path change that was not this drag's own push wins: cancel any live
    // preview so a tab tap cannot fight a finger still on the deck. The path
    // has landed, so a pending navigation guard no longer applies.
    gestureRef.current = null;
    navigatingRef.current = null;
    ensureMounted(activeIndex);
    if (reducedRef.current) reducedSwap(activeIndex, false);
    else startSettle(activeIndex, COMMIT_MS, false);
  }, [activeIndex, ensureMounted, reducedSwap, startSettle]);

  // Native, non-passive touch listeners: React's synthetic touchmove is
  // passive, and the horizontal lock must be able to preventDefault().
  useEffect(() => {
    const deck = deckRef.current;
    if (!deck) return;

    function onStart(e: TouchEvent) {
      if (e.touches.length !== 1) {
        // A second finger abandons the preview; never leave the track or pill
        // stranded mid-drag.
        const g = gestureRef.current;
        gestureRef.current = null;
        if (g?.axis === 'horizontal') springBack(velocityOf(g));
        else if (g) onPillEnd(null, 0);
        return;
      }
      gestureRef.current = null;
      // A tap settle is 340ms; starting a drag from the old track origin would
      // jump. Let the committed transition finish first.
      if (settlingRef.current) return;
      if (navigatingRef.current !== null) {
        if (Date.now() - navigatingRef.current < NAV_GUARD_MS) return;
        navigatingRef.current = null;
      }
      if (swipeBlockedAt(e.target)) return;
      const t = e.touches[0];
      // Two cold neighbours would otherwise mount on the lock, inside
      // touchmove. Prewarm handles the normal case; this is the fallback.
      for (const i of [baseIndexRef.current - 1, baseIndexRef.current + 1]) {
        if (i >= 0 && i < TABS.length && !mountedRef.current.has(i)) ensureMounted(i);
      }
      // Measure the pill before any movement. Lock and touchmove then only
      // write transforms; no React state and no layout reads in the hot path.
      onPillStart(baseIndexRef.current);
      gestureRef.current = {
        id: t.identifier,
        startX: t.clientX,
        startY: t.clientY,
        axis: 'pending',
        locked: false,
        lockDx: 0,
        fingerDx: 0,
        offset: 0,
        samples: [{ x: t.clientX, t: e.timeStamp }],
      };
    }

    function lock(g: Gesture, dx: number, dy: number, ev: TouchEvent) {
      g.axis = 'horizontal';
      g.locked = true;
      g.lockDx = dx;
      if (ev.cancelable) ev.preventDefault();
      if (!reducedRef.current) showNeighbour(dx < 0 ? 1 : -1);
      const w = widthRef.current;
      if (w > 0) {
        cancelTrackAnim();
        // Computed origin, not a getComputedStyle read: lock is still inside
        // touchmove and must stay free of layout reads.
        beginTrackMotion();
        const dim = dimRef.current;
        if (dim) {
          dimTokenRef.current++;
          dim.style.transition = 'none';
          dim.style.willChange = 'opacity';
        }
      }
      // dy is part of the shared axis contract, even when only dx drives the
      // preview; keep it in the signature so the lock is auditable.
      void dy;
    }

    function onMove(e: TouchEvent) {
      const g = gestureRef.current;
      if (!g) return;
      if (e.touches.length !== 1) {
        gestureRef.current = null;
        if (g.axis === 'horizontal') springBack(velocityOf(g));
        else onPillEnd(null, 0);
        return;
      }
      const t = e.touches[0];
      if (!t || t.identifier !== g.id) return;
      const dx = t.clientX - g.startX;
      const dy = t.clientY - g.startY;
      if (g.axis === 'pending') {
        const axis = classifyAxis(dx, dy);
        if (axis === 'pending') return;
        if (axis === 'vertical') { g.axis = 'vertical'; return; }
        lock(g, dx, dy, e);
      }
      if (g.axis !== 'horizontal') return;
      if (e.cancelable) e.preventDefault();

      const w = widthRef.current;
      if (!w) return;
      g.fingerDx = dx;
      const raw = dragFromLock(dx, g.lockDx);
      const offset = applyEdgeResistance(raw, baseIndexRef.current, TABS.length, w);
      g.offset = offset;
      offsetRef.current = offset;
      const progress = tabProgress(baseIndexRef.current, offset, w, TABS.length);
      if (!reducedRef.current) {
        if (offset < 0) showNeighbour(1);
        else if (offset > 0) showNeighbour(-1);
        paintTrack(-baseIndexRef.current * w + offset);
        const dim = dimRef.current;
        if (dim) dim.style.opacity = String(pageDim(progress, baseIndexRef.current));
        onPillMove(progress);
      }

      g.samples.push({ x: t.clientX, t: e.timeStamp });
      const cutoff = e.timeStamp - 100;
      while (g.samples.length > 1 && g.samples[0].t < cutoff) g.samples.shift();
    }

    function suppressNextClick() {
      // The synthetic click lands immediately after touchend; keep the window
      // short so an intentional follow-up tap is not swallowed.
      const until = Date.now() + 350;
      const handler = (ev: MouseEvent) => {
        if (Date.now() > until) { cleanup(); return; }
        ev.preventDefault();
        ev.stopPropagation();
        cleanup();
      };
      const cleanup = () => document.removeEventListener('click', handler, true);
      document.addEventListener('click', handler, true);
      window.setTimeout(cleanup, 400);
    }

    function velocityOf(g: Gesture): number {
      const last = g.samples[g.samples.length - 1];
      const first = g.samples[0];
      if (!last || !first || last.t <= first.t) return 0;
      return Math.abs(last.x - first.x) / (last.t - first.t);
    }

    function springBack(velocity = 0) {
      const w = widthRef.current;
      if (reducedRef.current) {
        onPillEnd(null, 0);
        offsetRef.current = 0;
        if (w) setRestOffset(baseIndexRef.current);
        syncVisible(baseIndexRef.current);
        clearDim();
        return;
      }
      const duration = settleDuration(Math.abs(offsetRef.current), w, velocity);
      clearDim(duration);
      onPillEnd(null, duration);
      animateTrack(-baseIndexRef.current * w, duration, SPRING_EASE, () => {
        offsetRef.current = 0;
        setRestOffset(baseIndexRef.current);
        syncVisible(baseIndexRef.current);
        clearDim();
      });
    }

    function onEnd(e: TouchEvent) {
      const g = gestureRef.current;
      gestureRef.current = null;
      if (!g || g.axis !== 'horizontal') {
        onPillEnd(null, 0);
        return;
      }
      suppressNextClick();
      const w = widthRef.current;
      if (!w) { springBack(); return; }

      const last = g.samples[g.samples.length - 1];
      const first = g.samples[0];
      let recentDx = last && first ? last.x - first.x : 0;
      let dtMs = last && first ? last.t - first.t : 0;
      const endAt = e.timeStamp;
      if (!last || !first || endAt - last.t > 80) { recentDx = 0; dtMs = 0; }
      const velocity = dtMs > 0 ? Math.abs(recentDx) / dtMs : 0;
      const dir = tabCommitDirection(g.offset, w, recentDx, dtMs, Math.abs(g.fingerDx));
      const target = baseIndexRef.current + dir;
      if (dir !== 0 && target >= 0 && target < TABS.length) {
        const remaining = Math.abs(-dir * w - g.offset);
        const duration = settleDuration(remaining, w, velocity);
        if (reducedRef.current) reducedSwap(target, true);
        else startSettle(target, duration, true);
      } else {
        springBack(velocity);
      }
    }

    function onCancel() {
      const g = gestureRef.current;
      gestureRef.current = null;
      if (!g || g.axis !== 'horizontal') {
        onPillEnd(null, 0);
        return;
      }
      springBack(velocityOf(g));
    }

    deck.addEventListener('touchstart', onStart, { passive: true });
    deck.addEventListener('touchmove', onMove, { passive: false });
    deck.addEventListener('touchend', onEnd, { passive: true });
    deck.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      deck.removeEventListener('touchstart', onStart);
      deck.removeEventListener('touchmove', onMove);
      deck.removeEventListener('touchend', onEnd);
      deck.removeEventListener('touchcancel', onCancel);
    };
  }, [animateTrack, beginTrackMotion, cancelTrackAnim, clearDim, ensureMounted, onPillEnd, onPillMove, onPillStart, paintTrack, reducedSwap, setRestOffset, showNeighbour, startSettle, syncVisible]);

  return (
    <div ref={deckRef} className="relative h-full w-full overflow-hidden" data-tab-deck="">
      <div
        ref={trackRef}
        className="onit-tab-track flex h-full"
        style={{
          width: `${TABS.length * 100}%`,
          // Correct before hydration and before the first layout effect; once
          // mounted, the resting offset is an imperative pixel margin.
          marginLeft: initialMargin,
        }}
      >
        {TABS.map((tab, i) => (
          <section
            key={tab.href}
            ref={(el) => {
              if (!el) { sectionRefs.current[i] = null; return; }
              const prev = sectionRefs.current[i];
              sectionRefs.current[i] = el;
              el.inert = i !== currentIndex;
              if (prev !== el && i !== currentIndexRef.current && !gestureRef.current && !settlingRef.current) {
                el.style.visibility = 'hidden';
              }
            }}
            aria-hidden={i !== currentIndex}
            className="relative h-full shrink-0 overflow-hidden"
            style={{
              flex: `0 0 ${100 / TABS.length}%`,
              pointerEvents: i === currentIndex ? 'auto' : 'none',
            }}
          >
            {mounted.has(i) ? (
              <TabScroller
                index={i}
                className={i === 2 ? 'h-full min-h-0' : 'h-full overflow-y-auto'}
              >
                {i === 0 && <ClientsView active={i === currentIndex} />}
                {i === 1 && <InvoicesView active={i === currentIndex} />}
                {i === 2 && <ChatView active={i === currentIndex} />}
                {i === 3 && <BooksView active={i === currentIndex} />}
                {i === 4 && (
                  <SettingsTab
                    connectEnabled={connectEnabled}
                    subscriptionsEnabled={subscriptionsEnabled}
                    active={i === currentIndex}
                  />
                )}
              </TabScroller>
            ) : (
              <div className="h-full w-full bg-background" />
            )}
          </section>
        ))}
      </div>
      {/* One compositor-friendly scrim for the whole deck. Per-page overlays
          meant five opacity writes on every touchmove. */}
      <div
        ref={dimRef}
        data-deck-dim=""
        aria-hidden
        className="pointer-events-none absolute inset-0 z-20 bg-black opacity-0"
      />
    </div>
  );
}
