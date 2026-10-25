'use client';
// Step 1 · What you win — four demo slides that show the product doing the
// thing before asking for anything. The deck is the existing paywall carousel
// (PaywallSlideshow: scroll-snap, dots, pause on interaction, reduced-motion
// off switch), rotated on the showcase's own 4.2s beat and pointed at the four
// slides the design names.
//
// Nothing here is new art: each slide is the static DOM/SVG graphic in
// PaywallSlides.tsx with a live-text headline. Slide 4 is the recaps slide and
// rides lib/recaps-live — off, the deck is three slides, never a blank one.
import { useLayoutEffect, useRef, useState } from 'react';
import PaywallSlideshow from '@/components/paywall/PaywallSlideshow';
import type { SlideId } from '@/components/paywall/PaywallSlides';
import { STEP_TITLE } from '@/lib/paywall-copy';
import { RECAPS_LIVE } from '@/lib/recaps-live';

/** The showcase beat (the carousel's own default is the old page's 4s). */
export const SHOWCASE_MS = 4200;

const DECK: SlideId[] = ['invoice', 'estimate', 'paid', ...(RECAPS_LIVE ? ['recap' as const] : [])];

export default function ShowcaseStep({ reason, start }: {
  /** The wall's reason pill (a soft prompt may have replaced the variant's). */
  reason: string;
  /** The slide this wall opens on (START_SLIDE), always one of the deck's. */
  start: SlideId;
}) {
  // The deck fills whatever height the step has, measured rather than assumed,
  // so the four slides stay in view above the Continue button on an SE too.
  const boxRef = useRef<HTMLDivElement>(null);
  const [deckH, setDeckH] = useState(0);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setDeckH(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col px-4">
      <div className="flex justify-center pb-2">
        <p className="rounded-full bg-surface-container px-3 py-1 text-[13px] font-semibold leading-[18px] text-on-surface-variant">
          {reason}
        </p>
      </div>
      <h2
        id="paywall-step-title"
        tabIndex={-1}
        className="mb-1 shrink-0 text-center font-display text-[22px] font-extrabold tracking-[-0.01em] outline-none"
      >
        {STEP_TITLE.showcase}
      </h2>
      <div ref={boxRef} className="min-h-0 flex-1">
        {deckH > 0 && <PaywallSlideshow slides={DECK} start={start} height={deckH} intervalMs={SHOWCASE_MS} />}
      </div>
    </div>
  );
}
