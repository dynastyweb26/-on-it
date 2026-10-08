'use client';
// Swipe-down to close a bottom sheet (template pickers; merge 2 · 2·10a).
// Only the handle area (grabber + header) drags; the list scrolls as usual.
// Past DISMISS_PX, or a fast downward flick, the sheet slides out and
// closes; otherwise it springs back. The handle has touch-action: none and
// the page's vertical overscroll is switched off while the sheet is open, so
// the drag never becomes the browser's pull-to-refresh. Reduce Motion: the
// global rule drops the slide; the close itself still happens.
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';

export const DISMISS_PX = 100;
export const FLICK_PX_PER_MS = 0.5;
const SLOP_PX = 4;
const OUT_MS = 200;

/** Close on a long enough drag, or a fast flick that has clearly started. */
export function shouldDismiss(dy: number, ms: number): boolean {
  if (dy >= DISMISS_PX) return true;
  return dy > 24 && ms > 0 && dy / ms >= FLICK_PX_PER_MS;
}

/**
 * @param onDismiss  called when the gesture passes the threshold.
 * @param slideOut   true: the sheet slides away first (closing). false: it
 *                   springs back and onDismiss runs at once (e.g. a form
 *                   inside the sheet returning to its list, 2·10b).
 */
export function useSheetDrag(onDismiss: () => void, slideOut = true) {
  const latest = useRef({ onDismiss, slideOut });
  latest.current = { onDismiss, slideOut };
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const start = useRef<{ y: number; id: number; captured: boolean; samples: { y: number; t: number }[] } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.overscrollBehaviorY;
    html.style.overscrollBehaviorY = 'none';
    return () => { html.style.overscrollBehaviorY = prev; clearTimeout(timer.current); };
  }, []);

  function end(e: PointerEvent<HTMLElement>) {
    const s = start.current;
    start.current = null;
    if (!s) return;
    setDragging(false);
    const moved = Math.max(0, e.clientY - s.y);
    // Flick speed over the last ~100 ms of movement (a finger may rest first).
    const now = performance.now();
    const from = s.samples.find((p) => now - p.t <= 100) ?? s.samples[s.samples.length - 1] ?? { y: s.y, t: now };
    const recent = Math.max(0, e.clientY - from.y);
    const recentMs = Math.max(1, now - from.t);
    if (s.captured && (moved >= DISMISS_PX || (moved > 24 && shouldDismiss(recent, recentMs)))) {
      const { onDismiss: done, slideOut: away } = latest.current;
      if (!away) { setDy(0); done(); return; }
      setLeaving(true);
      setDy(window.innerHeight);
      timer.current = setTimeout(done, OUT_MS);
    } else {
      setDy(0);
    }
  }

  const handleProps = {
    style: { touchAction: 'none' } as CSSProperties,
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (leaving || (e.pointerType === 'mouse' && e.button !== 0)) return;
      start.current = { y: e.clientY, id: e.pointerId, captured: false, samples: [{ y: e.clientY, t: performance.now() }] };
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const s = start.current;
      if (!s || e.pointerId !== s.id) return;
      const moved = e.clientY - s.y;
      // Capture only once it's really a drag, so a plain tap on Cancel still clicks.
      if (!s.captured && moved > SLOP_PX) {
        s.captured = true;
        setDragging(true);
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not supported */ }
      }
      s.samples.push({ y: e.clientY, t: performance.now() });
      if (s.samples.length > 12) s.samples.shift();
      if (s.captured) setDy(Math.max(0, moved));
    },
    onPointerUp: end,
    onPointerCancel: end,
  };

  const sheetStyle: CSSProperties = {
    transform: dy ? `translateY(${dy}px)` : undefined,
    transition: dragging ? 'none' : `transform ${leaving ? OUT_MS : 240}ms var(--ease-standard)`,
  };
  // The scrim fades with the drag.
  const scrimStyle: CSSProperties = { opacity: leaving ? 0 : Math.max(0.2, 1 - dy / 400), transition: dragging ? 'none' : 'opacity 200ms' };

  return { handleProps, sheetStyle, scrimStyle };
}
