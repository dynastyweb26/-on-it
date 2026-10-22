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
  AXIS_SLOP_PX,
  NAV_GUARD_MS,
  TAB_COMMIT_FRACTION,
  applyEdgeResistance,
  classifyAxis,
  pageDim,
  tabCommitDirection,
  tabProgress,
} from '@/lib/swipe';
import { swipeBlockedAt } from '@/lib/swipe-dom';
import { COMMIT_EASE, COMMIT_MS, FLICK_MS, SPRING_EASE, SPRING_MS, markTabGestureNavigation } from './tab-motion';

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
  /** Direction the 12px dead zone was consumed in; fixed for the gesture. */
  lockSign: -1 | 1;
  offset: number;
  samples: Sample[];
};

type PillStart = (activeIndex: number) => void;
type PillMove = (progress: number) => void;
type PillEnd = (target: number | null, durationMs: number) => void;

export default function TabDeck({
  activeIndex,
  connectEnabled,
  onPillStart,
  onPillMove,
  onPillEnd,
}: {
  activeIndex: number;
  connectEnabled: boolean;
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
  const dimRefs = useRef<(HTMLDivElement | null)[]>([]);
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
  // not move; later per-move writes only touch transform.
  const beginTrackMotion = useCallback(() => {
    const track = trackRef.current;
    if (!track || !widthRef.current) return;
    const x = trackX();
    track.style.transition = 'none';
    track.style.marginLeft = '0px';
    track.style.willChange = 'transform';
    track.style.transform = `translate3d(${x}px, 0, 0)`;
  }, [trackX]);

  const clearDims = useCallback((durationMs = 0) => {
    const token = ++dimTokenRef.current;
    for (const el of dimRefs.current) {
      if (!el) continue;
      if (durationMs > 0) {
        el.style.transition = `opacity ${durationMs}ms ease`;
        el.style.opacity = '0';
        window.setTimeout(() => {
          if (dimTokenRef.current !== token) return;
          el.style.transition = 'none';
          el.style.opacity = '0';
        }, durationMs + 40);
      } else {
        el.style.transition = 'none';
        el.style.opacity = '0';
      }
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
    clearDims();
    settlingRef.current = null;
  }, [clearDims, ensureMounted, setRestOffset]);

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
    cancelTrackAnim();
    beginTrackMotion();
    settlingRef.current = { target };
    currentIndexRef.current = target;
    setCurrentIndex(target);
    ensureMounted(target);
    clearDims(durationMs);
    onPillEnd(target, durationMs);
    animateTrack(-target * widthRef.current, durationMs, COMMIT_EASE, () => finishSettle(target));
    if (push) {
      markTabGestureNavigation();
      navigatingRef.current = Date.now();
      router.push(TABS[target].href);
    }
  }, [animateTrack, beginTrackMotion, cancelTrackAnim, clearDims, ensureMounted, finishSettle, onPillEnd, router]);

  const reducedSwap = useCallback((target: number, push: boolean) => {
    if (target < 0 || target >= TABS.length) return;
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
      clearDims();
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
  }, [cancelTrackAnim, clearDims, ensureMounted, finishSettle, onPillEnd, router, setRestOffset]);

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
        if (g?.axis === 'horizontal') springBack();
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
      gestureRef.current = {
        id: t.identifier,
        startX: t.clientX,
        startY: t.clientY,
        axis: 'pending',
        locked: false,
        lockSign: 1,
        offset: 0,
        samples: [{ x: t.clientX, t: e.timeStamp }],
      };
    }

    function lock(g: Gesture, dx: number, dy: number, ev: TouchEvent) {
      g.axis = 'horizontal';
      g.locked = true;
      g.lockSign = dx < 0 ? -1 : 1;
      if (ev.cancelable) ev.preventDefault();
      const w = widthRef.current;
      if (w > 0) {
        cancelTrackAnim();
        beginTrackMotion();
        if (trackRef.current) trackRef.current.style.transition = 'none';
        dimTokenRef.current++;
        for (const el of dimRefs.current) if (el) el.style.transition = 'none';
        onPillStart(baseIndexRef.current);
        const dir = dx < 0 ? 1 : -1;
        ensureMounted(baseIndexRef.current + dir);
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
        if (g.axis === 'horizontal') springBack();
        return;
      }
      const t = Array.from(e.touches).find((p) => p.identifier === g.id);
      if (!t) return;
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
      // Subtract the dead zone once, in the direction it was consumed. Using
      // sign(dx) here would pop 2 * slop as the finger crosses its origin.
      const raw = dx - g.lockSign * AXIS_SLOP_PX;
      const offset = applyEdgeResistance(raw, baseIndexRef.current, TABS.length, w);
      g.offset = offset;
      offsetRef.current = offset;
      const progress = tabProgress(baseIndexRef.current, offset, w, TABS.length);
      if (!reducedRef.current) {
        paintTrack(-baseIndexRef.current * w + offset);
        for (let i = 0; i < TABS.length; i++) {
          const el = dimRefs.current[i];
          if (el) el.style.opacity = String(pageDim(progress, i));
        }
        onPillMove(progress);
      }
      // If the finger reverses, the other neighbour may not be mounted yet.
      ensureMounted(baseIndexRef.current + (offset < 0 ? 1 : -1));

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

    function springBack() {
      const w = widthRef.current;
      if (reducedRef.current) {
        onPillEnd(null, 0);
        offsetRef.current = 0;
        if (w) setRestOffset(baseIndexRef.current);
        clearDims();
        return;
      }
      clearDims(SPRING_MS);
      onPillEnd(null, SPRING_MS);
      animateTrack(-baseIndexRef.current * widthRef.current, SPRING_MS, SPRING_EASE, () => {
        offsetRef.current = 0;
        setRestOffset(baseIndexRef.current);
        clearDims();
      });
    }

    function onEnd(e: TouchEvent) {
      const g = gestureRef.current;
      gestureRef.current = null;
      if (!g || g.axis !== 'horizontal') return;
      suppressNextClick();
      const w = widthRef.current;
      if (!w) { springBack(); return; }

      const last = g.samples[g.samples.length - 1];
      const first = g.samples[0];
      let recentDx = last && first ? last.x - first.x : 0;
      let dtMs = last && first ? last.t - first.t : 0;
      const endAt = e.timeStamp;
      if (!last || !first || endAt - last.t > 80) { recentDx = 0; dtMs = 0; }
      // The net finger travel from the touch origin (offset had the dead zone
      // removed). Used for the flick's 90px distance gate.
      const fingerDx = g.offset + g.lockSign * AXIS_SLOP_PX;
      const dir = tabCommitDirection(g.offset, w, recentDx, dtMs, Math.abs(fingerDx));
      const target = baseIndexRef.current + dir;
      if (dir !== 0 && target >= 0 && target < TABS.length) {
        const duration = Math.abs(g.offset) > TAB_COMMIT_FRACTION * w ? COMMIT_MS : FLICK_MS;
        if (reducedRef.current) reducedSwap(target, true);
        else startSettle(target, duration, true);
      } else {
        springBack();
      }
    }

    function onCancel() {
      const g = gestureRef.current;
      gestureRef.current = null;
      if (!g || g.axis !== 'horizontal') return;
      springBack();
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
  }, [animateTrack, beginTrackMotion, cancelTrackAnim, clearDims, ensureMounted, onPillEnd, onPillMove, onPillStart, paintTrack, reducedSwap, setRestOffset, startSettle]);

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
            ref={(el) => { if (el) el.inert = i !== currentIndex; }}
            aria-hidden={i !== currentIndex}
            className="relative h-full shrink-0 overflow-hidden"
            style={{
              flex: `0 0 ${100 / TABS.length}%`,
              pointerEvents: i === currentIndex ? 'auto' : 'none',
            }}
          >
            {mounted.has(i) ? (
              <div
                data-tab-scroll-owner=""
                className={i === 2 ? 'h-full min-h-0' : 'h-full overflow-y-auto'}
              >
                {i === 0 && <ClientsView active={i === currentIndex} />}
                {i === 1 && <InvoicesView active={i === currentIndex} />}
                {i === 2 && <ChatView active={i === currentIndex} />}
                {i === 3 && <BooksView active={i === currentIndex} />}
                {i === 4 && <SettingsTab connectEnabled={connectEnabled} active={i === currentIndex} />}
              </div>
            ) : (
              <div className="h-full w-full bg-background" />
            )}
            <div
              ref={(el) => { dimRefs.current[i] = el; }}
              aria-hidden
              className="pointer-events-none absolute inset-0 z-20 bg-black opacity-0"
            />
          </section>
        ))}
      </div>
    </div>
  );
}
