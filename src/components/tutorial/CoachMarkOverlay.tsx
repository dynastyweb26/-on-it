'use client';
/* ═══ CoachMarkOverlay ═══
   A full-screen overlay that cuts a spotlight hole over a real DOM element
   and shows a tooltip with step navigation. It draws directly over the live
   app — no device frame, no fixed artboard size.

   The parent (CoachMarks) owns which step is active; this component is
   purely presentational: it gets a step definition and the tour's step count
   and emits next/back/skip callbacks.

   Geometry (all in VIEWPORT coordinates — the overlay is position: fixed and
   the app shell never scrolls the document):
   - Spotlight: the first VISIBLE match of the step's selector (a selector can
     list a mobile and a desktop target, e.g. the bottom tab bar and the
     sidebar nav). Capped at step.maxH, anchored to the target's top edge.
   - Tooltip: min(100vw − 32px, 400px) wide. Placed below the spotlight if it
     fits, else above, else on the side with more room — always clamped 16px
     inside the viewport, and never over the bottom tab bar (unless the tab
     bar IS the spotlight, in which case the tooltip sits above it).
   - Re-measured on resize, orientation change, visual-viewport resize and any
     scroll, plus a few settle passes while the route mounts. */

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { CoachStep } from './coach-marks';

interface Rect { top: number; left: number; w: number; h: number; r: number }

const GOLD = '#c9a227';
const MARGIN = 16; // viewport margin on every side
const GAP = 12;    // space between spotlight and tooltip

interface Props {
  step: CoachStep;
  stepIndex: number;
  totalSteps: number;
  tourName: string;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  /** True when this is the last step of the LAST tab (shows "Done" CTA). */
  isFinalStep?: boolean;
}

/** First match of the selector that is actually rendered (non-zero box). */
function visibleTarget(selector: string): Element | null {
  for (const el of Array.from(document.querySelectorAll(selector))) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

export default function CoachMarkOverlay({
  step, stepIndex, totalSteps, tourName, onNext, onBack, onSkip, isFinalStep = false,
}: Props) {
  const [spot, setSpot] = useState<Rect | null>(null);
  const [tip, setTip] = useState<{ top: number; left: number } | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  const measure = useCallback(() => {
    const vw = window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const el = visibleTarget(step.selector);
    let s: Rect | null = null;
    if (el) {
      const r = el.getBoundingClientRect();
      const p = step.pad ?? 6;
      const h = r.height + 2 * p;
      s = {
        top: r.top - p,
        left: r.left - p,
        w: r.width + 2 * p,
        h: step.maxH !== undefined ? Math.min(h, step.maxH) : h,
        r: step.r ?? 20,
      };
    }
    setSpot(s);

    // Tooltip placement.
    const card = tipRef.current;
    const th = card?.offsetHeight ?? 200;
    const tw = card?.offsetWidth ?? Math.min(vw - 2 * MARGIN, 400);
    const bar = visibleTarget('nav[data-coach="tab-bar"]');
    const barRect = bar?.getBoundingClientRect();
    // The bottom tab bar is off-limits unless it is the spotlighted element
    // (then the tooltip has to go above it anyway).
    const barIsSpot = !!el && !!bar && el === bar;
    const floor = barRect && barRect.top < vh && !barIsSpot
      ? Math.min(vh - MARGIN, barRect.top - GAP)
      : vh - MARGIN;
    const minTop = MARGIN;

    let top: number;
    if (!s) {
      top = Math.max(minTop, (floor - th) / 2); // no target yet: centre it
    } else {
      const below = s.top + s.h + GAP;
      const above = s.top - GAP - th;
      if (below + th <= floor) top = below;
      else if (above >= minTop) top = above;
      else {
        // Neither fits cleanly: take the side with more room.
        const roomBelow = floor - (s.top + s.h);
        const roomAbove = s.top - minTop;
        top = roomBelow >= roomAbove ? below : above;
      }
    }
    top = Math.max(minTop, Math.min(top, floor - th));

    const centre = s ? s.left + s.w / 2 : vw / 2;
    const left = Math.max(MARGIN, Math.min(centre - tw / 2, vw - MARGIN - tw));
    setTip({ top, left });
  }, [step]);

  useLayoutEffect(() => {
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    // Bring an off-screen target into view inside its own scroller.
    visibleTarget(step.selector)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });

    function run() {
      if (cancelled) return;
      measure();
      // The route may still be mounting: keep looking for the target.
      if (!visibleTarget(step.selector)) retry = setTimeout(run, 80);
    }
    run();
    const t1 = setTimeout(measure, 150);
    const t2 = setTimeout(measure, 600);

    const onChange = () => measure();
    window.addEventListener('resize', onChange);
    window.addEventListener('orientationchange', onChange);
    window.addEventListener('scroll', onChange, true);
    window.visualViewport?.addEventListener('resize', onChange);
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('resize', onChange);
      window.removeEventListener('orientationchange', onChange);
      window.removeEventListener('scroll', onChange, true);
      window.visualViewport?.removeEventListener('resize', onChange);
    };
  }, [step, measure]);

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === totalSteps - 1;

  return (
    <div
      className="pointer-events-none fixed left-0 top-0 z-[9999] w-screen"
      style={{ height: '100dvh' }}
      aria-modal={true}
      role="dialog"
      aria-label={`${tourName} — Step ${stepIndex + 1} of ${totalSteps}`}
    >
      {/* Darkened backdrop with the spotlight knocked out (even-odd path). */}
      <svg
        className="pointer-events-auto absolute inset-0 h-full w-full"
        style={{ cursor: 'default' }}
        onClick={onSkip}
        aria-hidden
      >
        <defs>
          <mask id="coach-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {spot && (
              <rect x={spot.left} y={spot.top} width={spot.w} height={spot.h} rx={Math.min(spot.r, spot.h / 2, spot.w / 2)} fill="black" />
            )}
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask="url(#coach-mask)" />
      </svg>

      {/* Gold pulse ring around the spotlight */}
      {spot && (
        <div
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.w,
            height: spot.h,
            borderRadius: Math.min(spot.r, spot.h / 2, spot.w / 2),
            boxShadow: `0 0 0 3px ${GOLD}, 0 0 0 6px rgba(201,162,39,.35)`,
            animation: 'coach-pulse 2s ease-out infinite',
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        ref={tipRef}
        className="pointer-events-auto absolute"
        style={{
          top: tip?.top ?? -9999,
          left: tip?.left ?? 0,
          width: 'min(calc(100vw - 32px), 400px)',
          visibility: tip ? 'visible' : 'hidden',
          animation: 'coach-up 220ms cubic-bezier(.2,.8,.4,1) both',
        }}
        // Stop tap-through to the backdrop's skip handler.
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-2xl bg-inverse-surface px-5 py-4 shadow-2xl">
          {/* Progress label */}
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-inverse-on-surface/60">
            {tourName} · Step {stepIndex + 1} of {totalSteps}
          </p>

          {/* Content */}
          <h2 className="mb-1.5 font-display text-lg font-bold leading-tight text-inverse-primary">
            {step.title}
          </h2>
          <p className="text-[14px] leading-relaxed text-inverse-on-surface/80">
            {step.body}
          </p>

          {/* Progress dots */}
          <div className="mt-3 flex items-center gap-1.5">
            {Array.from({ length: totalSteps }, (_, i) => (
              <span
                key={i}
                aria-hidden
                className="block rounded-full transition-all"
                style={{
                  width: i === stepIndex ? 20 : 6,
                  height: 6,
                  background:
                    i === stepIndex
                      ? GOLD
                      : i < stepIndex
                      ? 'rgba(201,162,39,.7)'
                      : 'rgba(201,162,39,.3)',
                }}
              />
            ))}
          </div>

          {/* Nav buttons */}
          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              className="min-h-[44px] text-[13px] font-semibold text-inverse-on-surface/50 transition active:opacity-70"
              style={{ opacity: isFirst ? 0.35 : 1, pointerEvents: isFirst ? 'none' : 'auto' }}
              onClick={onBack}
              aria-label="Previous step"
            >
              ← Back
            </button>

            <div className="flex items-center gap-2">
              <button
                className="min-h-[44px] px-2 text-[13px] font-medium text-inverse-on-surface/50 transition active:opacity-70"
                onClick={onSkip}
              >
                Skip
              </button>
              <button
                className="min-h-[44px] rounded-full px-5 text-[14px] font-bold transition active:scale-95"
                style={{ background: GOLD, color: '#1a1a1a' }}
                onClick={onNext}
              >
                {isLast ? (isFinalStep ? 'Done ✓' : 'Got it') : 'Next →'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
