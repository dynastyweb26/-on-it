'use client';
/* ═══ SlideCarousel — the linear, swipeable presentation ═══
   A container-agnostic carousel over any Slide[]: horizontal snap-scroll, a
   Skip control top-right, dot indicators. It knows nothing about first-run
   gating or the reference doc — callers pass the slides and an onClose. This is
   the "presentational component, independent of the container" half of the
   split; the first-run surface is a thin wrapper that hands it four slides. */
import { useRef, useState } from 'react';
import type { Slide } from '@/components/tutorial/slides';
import { SlideMock } from '@/components/tutorial/mocks';

import Icon from '@/components/Icon';

export default function SlideCarousel({ slides, onClose }: { slides: Slide[]; onClose: () => void }) {
  const [index, setIndex] = useState(0);

  function advance() {
    if (index < slides.length - 1) {
      setIndex((i) => i + 1);
    } else {
      onClose();
    }
  }

  const current = slides[index];

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-between bg-background select-none cursor-pointer"
      onClick={advance}
    >
      {/* Skip — top-right */}
      <div className="flex items-center justify-between px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <span className="text-xs font-bold text-on-surface-variant">
          Step {index + 1} of {slides.length}
        </span>
        <button
          className="min-h-touch rounded-full px-4 text-label-lg font-semibold text-on-surface-variant transition-transform active:scale-95"
          onClick={onClose}
        >
          Skip
        </button>
      </div>

      {/* Main Slide Content */}
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-2">
        {current && (
          <>
            <div className="w-full max-w-sm card p-3 border-l-4 border-l-primary bg-surface-container-lowest shadow-md">
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                {current.tooltipTitle || 'Interactive Walkthrough'}
              </span>
              <h2 className="font-display text-lg font-extrabold text-on-background mt-0.5">
                {current.headline}
              </h2>
              <p className="mt-1 text-xs text-on-surface-variant">
                {current.tooltipText || current.body}
              </p>
            </div>

            <div className="w-full max-w-sm flex justify-center my-auto">
              <SlideMock mock={current.mock} spotlight={current.spotlight} active={true} pulse={true} />
            </div>
          </>
        )}
      </div>

      {/* Footer controls & prompt */}
      <div className="flex flex-col items-center gap-2 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-center gap-2">
          {slides.map((_, i) => (
            <span
              key={i}
              className={`h-2 rounded-full transition-all ${i === index ? 'w-6 bg-primary-container' : 'w-2 bg-outline-variant'}`}
            />
          ))}
        </div>
        <div className="mt-1 bg-primary-container/80 rounded-full px-4 py-1 text-[11px] font-bold text-on-background flex items-center gap-1.5">
          <Icon name="play_arrow" size={14} /> Tap anywhere to follow along
        </div>
      </div>
    </div>
  );
}
