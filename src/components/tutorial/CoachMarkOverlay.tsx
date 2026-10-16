'use client';
/* ═══ CoachMarkOverlay ═══
   A full-screen overlay that cuts a spotlight hole over a real DOM element
   and shows a tooltip with step navigation.

   The parent (layout.tsx) owns which tab/step is active and when to show
   the overlay — this component is purely presentational: it gets a step
   definition and the tour's step count and emits next/back/skip callbacks.

   Spotlight measurement:
   - getBoundingClientRect() on the selector target gives a viewport-relative
     rect.  We convert to page-relative (adding window.scroll*) for the SVG
     clip-path which also lives in page space.
   - If the target element is absent (lazy route not yet mounted) the cutout
     collapses to the bottom-centre of the screen (invisible) and the tooltip
     still shows. */

import { useLayoutEffect, useRef, useState } from 'react';
import type { CoachStep } from './coach-marks';

interface Rect {
  top: number;
  left: number;
  w: number;
  h: number;
  r: number;
}

const OFFSCREEN: Rect = { top: 9999, left: 9999, w: 0, h: 0, r: 20 };
const GOLD = '#c9a227';

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

export default function CoachMarkOverlay({
  step, stepIndex, totalSteps, tourName,
  onNext, onBack, onSkip, isFinalStep = false,
}: Props) {
  const [spot, setSpot] = useState<Rect>(OFFSCREEN);
  const frameRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Measure the target element each time the step changes.
  useLayoutEffect(() => {
    let cancelled = false;

    function measure() {
      const el = document.querySelector(step.selector);
      if (!el) {
        // Try again shortly — the route might still be mounting.
        if (!cancelled) frameRef.current = setTimeout(measure, 80);
        return;
      }
      const r = el.getBoundingClientRect();
      const p = step.pad ?? 6;
      const h = r.height + 2 * p;
      setSpot({
        top: r.top + window.scrollY - p,
        left: r.left + window.scrollX - p,
        w: r.width + 2 * p,
        h: step.maxH !== undefined ? Math.min(h, step.maxH) : h,
        r: step.r ?? 20,
      });
    }

    // First measure immediately, then re-measure after layout settles.
    measure();
    const t1 = setTimeout(measure, 150);
    const t2 = setTimeout(measure, 600);

    const onResize = () => measure();
    window.addEventListener('resize', onResize);

    return () => {
      cancelled = true;
      if (frameRef.current !== null) clearTimeout(frameRef.current);
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('resize', onResize);
    };
  }, [step]);

  // Position the tooltip: below the spotlight when it's in the top 55% of
  // the screen, above it otherwise.
  const spotBottom = spot.top + spot.h;
  const scrollY = typeof window !== 'undefined' ? window.scrollY : 0;
  const vpH = typeof window !== 'undefined' ? window.innerHeight : 844;
  const tooltipBelow = spot.top - scrollY < vpH * 0.55;
  const rawTooltipTop = tooltipBelow
    ? spotBottom + 18
    : spot.top - 18 - 180; // 180 ≈ max tooltip height
  // Clamp so the card never runs off the bottom (240 ≈ card height + margin)
  // or off the top of the viewport.
  const tooltipTop = Math.max(16, Math.min(rawTooltipTop, vpH - 240));

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === totalSteps - 1;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[9999]"
      aria-modal={true}
      role="dialog"
      aria-label={`${tourName} — Step ${stepIndex + 1} of ${totalSteps}`}
    >
      {/* Darkened backdrop with spotlight cutout via SVG clipPath */}
      <svg
        className="pointer-events-auto absolute inset-0 h-full w-full"
        style={{ cursor: 'default' }}
        onClick={onSkip}
        aria-hidden
      >
        <defs>
          <clipPath id="coach-clip">
            {/* Full screen */}
            <rect x="0" y="0" width="100%" height="100%" />
            {/* Knock out the spotlight area */}
            <rect
              x={spot.left}
              y={spot.top}
              width={spot.w}
              height={spot.h}
              rx={spot.r}
              ry={spot.r}
            />
          </clipPath>
        </defs>
        <rect
          x="0" y="0" width="100%" height="100%"
          fill="rgba(0,0,0,0.55)"
          clipPath="url(#coach-clip)"
          style={{ clipRule: 'evenodd' }}
        />
      </svg>

      {/* Gold pulse ring around the spotlight */}
      {spot.top !== OFFSCREEN.top && (
        <div
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.w,
            height: spot.h,
            borderRadius: spot.r,
            boxShadow: `0 0 0 3px ${GOLD}, 0 0 0 6px rgba(201,162,39,.35)`,
            animation: 'coach-pulse 2s ease-out infinite',
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        className="pointer-events-auto absolute mx-4"
        style={{
          top: tooltipTop,
          left: 0,
          right: 0,
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
              className="text-[13px] font-semibold text-inverse-on-surface/50 transition active:opacity-70"
              style={{ opacity: isFirst ? 0.35 : 1, pointerEvents: isFirst ? 'none' : 'auto' }}
              onClick={onBack}
              aria-label="Previous step"
            >
              ← Back
            </button>

            <div className="flex items-center gap-2">
              <button
                className="text-[13px] font-medium text-inverse-on-surface/50 transition active:opacity-70"
                onClick={onSkip}
              >
                Skip
              </button>
              <button
                className="rounded-full px-5 py-2 text-[14px] font-bold transition active:scale-95"
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
