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

export default function SlideCarousel({ slides, onClose }: { slides: Slide[]; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    setIndex(Math.round(el.scrollLeft / el.clientWidth));
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Skip — top-right, dismisses from any slide */}
      <div className="flex justify-end px-4 py-3">
        <button
          className="min-h-touch rounded-full px-4 text-label-lg font-semibold text-on-surface-variant transition-transform active:scale-95"
          onClick={onClose}
        >
          Skip
        </button>
      </div>

      <div
        ref={scroller}
        onScroll={onScroll}
        className="flex flex-1 snap-x snap-mandatory overflow-x-auto"
        style={{ scrollbarWidth: 'none' }}
      >
        {slides.map((s, i) => (
          <div key={s.id} className="flex w-full shrink-0 snap-center flex-col items-center justify-center gap-6 px-6 pb-8">
            <SlideMock mock={s.mock} spotlight={s.spotlight} active={i === index} />
            <div className="text-center">
              <h2 className="font-display text-2xl font-extrabold">{s.headline}</h2>
              <p className="mx-auto mt-2 max-w-xs text-body-md text-on-surface-variant">{s.body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-2 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
        {slides.map((_, i) => (
          <span
            key={i}
            className={`h-2 rounded-full transition-all ${i === index ? 'w-6 bg-primary-container' : 'w-2 bg-outline-variant'}`}
          />
        ))}
      </div>
    </div>
  );
}
