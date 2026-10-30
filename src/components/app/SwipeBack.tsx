'use client';
// Drag-follow back swipe on nested routes (MOTION-SPEC §18).
//
// Below 1280 a nested screen (/invoices/<id>, /settings/<section>, a client,
// the Vault …) renders as a full page whose only way back is the header arrow.
// A rightward drag used to do nothing until release, then cut to the parent.
// Here the page follows the finger the way a tab does, and commits through the
// same lib/swipe.ts maths (gating and thresholds: lib/back-gesture.ts).
//
// Owns the nested <main>: it renders it so the transform has the scroll
// container itself to move, and attaches its own non-passive touch listeners
// (React's are passive, so preventDefault at the horizontal lock is impossible
// there). The transform is written to the element every frame — no React state
// — and removed again at rest: a transformed ancestor becomes the containing
// block for fixed descendants, and the invoice detail's action bars rely on
// being portaled to <body> rather than on a transform-free ancestor.
//
// Without a live parent underlay (deliberately out of scope) a commit cannot
// show the parent tracking the finger. It shows the opposite half of the
// gesture: the outgoing page leaves in the direction and at the speed the
// finger left, then the parent slides in from the left (the shell's
// `onit-enter-from-left`, timed from the same release).
import { useCallback, useEffect, useRef, type HTMLAttributes, type ReactNode } from 'react';
import { backAxis, backCommits, backEnterMs, backOutMs, canStartBackSwipe } from '@/lib/back-gesture';
import { COMMIT_EASE, SPRING_EASE } from '@/components/tabs/tab-motion';
import { NAV_GUARD_MS, dragFromLock, settleDuration, type GestureAxis } from '@/lib/swipe';
import { swipeBlockedAt } from '@/lib/swipe-dom';
import { reducedMotion } from '@/lib/list-motion';

type Props = {
  /** The route one level up; null on a tab root (and at xl, where a document
   *  or a Settings section is the tab itself and there is no Back arrow). */
  parent: string | null;
  /** The shell's main ref: scroll save/restore keeps using it. */
  mainRef: React.MutableRefObject<HTMLDivElement | null>;
  /** Called once the outgoing page has left: navigation + the parent's entrance. */
  onBack: (enterMs: number) => void;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, 'children'>;

export default function SwipeBack({ parent, mainRef, onBack, className = '', children, ...rest }: Props) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const gesture = useRef<{ id: number; x: number; y: number; axis: GestureAxis; lockDx: number } | null>(null);
  const samples = useRef<{ x: number; t: number }[]>([]);
  const offset = useRef(0);
  const anim = useRef<Animation | null>(null);
  const lastNav = useRef(0);

  const setEl = useCallback((el: HTMLDivElement | null) => {
    elRef.current = el;
    mainRef.current = el;
  }, [mainRef]);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    const clear = () => {
      anim.current?.cancel();
      anim.current = null;
      el.style.transform = '';
      el.style.boxShadow = '';
      el.style.willChange = '';
      offset.current = 0;
    };

    const paint = (o: number) => {
      el.style.transform = o > 0 ? `translate3d(${o}px, 0, 0)` : '';
      // The page slides over its own background; the shadow is what makes that
      // read as a page moving rather than its content shifting.
      el.style.boxShadow = o > 0 ? '-14px 0 28px rgba(30, 26, 21, .16)' : '';
    };

    // Release speed over the last ~100 ms, so a finger that rests before it
    // lifts is not a flick however far it travelled.
    const release = () => {
      const now = performance.now();
      const list = samples.current;
      const last = list[list.length - 1] ?? { x: 0, t: now };
      const from = list.find((p) => now - p.t <= 100) ?? list[0] ?? last;
      const dt = Math.max(1, now - from.t);
      const recentDx = last.x - from.x;
      return { recentDx, dt, velocity: recentDx / dt };
    };

    const springBack = (velocity: number) => {
      const o = offset.current;
      if (!o || reducedMotion()) { clear(); return; }
      const width = el.clientWidth || window.innerWidth;
      anim.current = el.animate(
        [{ transform: `translate3d(${o}px, 0, 0)` }, { transform: 'translate3d(0, 0, 0)' }],
        { duration: settleDuration(o, width, velocity), easing: SPRING_EASE, fill: 'both' },
      );
      anim.current.onfinish = clear;
    };

    const commit = (velocity: number) => {
      const o = offset.current;
      const width = el.clientWidth || window.innerWidth;
      if (reducedMotion()) {
        // Reduce Motion: the step up happens at once, with no slide either way.
        clear();
        lastNav.current = Date.now();
        onBack(0);
        return;
      }
      anim.current = el.animate(
        [{ transform: `translate3d(${o}px, 0, 0)` }, { transform: `translate3d(${width}px, 0, 0)` }],
        { duration: backOutMs(o, width, velocity), easing: COMMIT_EASE, fill: 'both' },
      );
      anim.current.onfinish = () => {
        // Styles go first: the parent must mount at rest, then animate in.
        clear();
        lastNav.current = Date.now();
        onBack(backEnterMs(velocity));
      };
    };

    const onStart = (e: TouchEvent) => {
      gesture.current = null;
      if (anim.current) return;
      const t = e.touches[0];
      if (!t) return;
      const allowed = canStartBackSwipe({
        parent,
        path: window.location.pathname,
        clientX: t.clientX,
        touches: e.touches.length,
        guardOpen: Date.now() - lastNav.current >= NAV_GUARD_MS,
        blocked: swipeBlockedAt(e.target),
      });
      if (!allowed) return;
      gesture.current = { id: t.identifier, x: t.clientX, y: t.clientY, axis: 'pending', lockDx: 0 };
      samples.current = [{ x: t.clientX, t: performance.now() }];
    };

    const onMove = (e: TouchEvent) => {
      const g = gesture.current;
      if (!g) return;
      if (e.touches.length !== 1) { gesture.current = null; return; }
      const t = Array.from(e.touches).find((p) => p.identifier === g.id);
      if (!t) return;
      const dx = t.clientX - g.x;
      const dy = t.clientY - g.y;
      if (g.axis === 'pending') {
        const axis = backAxis(dx, dy);
        if (axis === 'pending') return;
        // Vertical is a scroll. Leftward is the shell's tab gesture.
        if (axis !== 'horizontal' || dx <= 0) { gesture.current = null; return; }
        g.axis = 'horizontal';
        g.lockDx = dx;
        el.style.willChange = 'transform';
      }
      // The gesture is ours from the lock on: the page must not scroll sideways
      // under it. Only this listener is non-passive, so this is the one place
      // the browser can be stopped.
      if (e.cancelable) e.preventDefault();
      offset.current = Math.max(0, dragFromLock(dx, g.lockDx));
      samples.current.push({ x: t.clientX, t: performance.now() });
      if (samples.current.length > 12) samples.current.shift();
      if (!reducedMotion()) paint(offset.current);
    };

    const onEnd = () => {
      const g = gesture.current;
      gesture.current = null;
      if (!g || g.axis !== 'horizontal') return;
      samples.current.push({ x: g.x + g.lockDx + offset.current, t: performance.now() });
      const { recentDx, dt, velocity } = release();
      const width = el.clientWidth || window.innerWidth;
      const o = offset.current;
      if (backCommits(o, width, recentDx, dt, o)) commit(velocity);
      else springBack(velocity);
    };

    const onCancel = () => {
      if (gesture.current?.axis === 'horizontal') { gesture.current = null; springBack(0); return; }
      gesture.current = null; // iOS took the gesture (native scroll)
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onCancel);
      gesture.current = null;
      clear();
    };
  }, [parent, onBack]);

  return (
    <main ref={setEl} data-tab-scroll-owner="" className={className} {...rest}>
      {children}
    </main>
  );
}
