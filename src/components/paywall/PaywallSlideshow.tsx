'use client';
// The paywall's feature slideshow (upper half of the page). A native CSS
// scroll-snap carousel — no carousel library: swipe is the browser's own
// scrolling, the page dots and auto-advance just scroll the track.
//  - Auto-advance every 4s; any touch, drag, wheel or dot tap pauses it, and it
//    resumes after 6s with no interaction.
//  - prefers-reduced-motion: no auto-advance, and dot taps jump instead of
//    animating (swipes are the user's own scroll, so they stay).
//  - Opens on `start` (the feature the wall was hit on).
// Each slide is the design's fixed 393×300 canvas scaled as a whole (`scale`,
// set by PaywallModal to fit short screens). Slides are DOM/SVG, so they stay
// crisp at any scale.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PaywallSlide, SLIDE_H, SLIDE_TITLE, SLIDE_W, type SlideId } from '@/components/paywall/PaywallSlides';

const ADVANCE_MS = 4000;
const RESUME_MS = 6000;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

export default function PaywallSlideshow({ slides, start, scale }: {
  slides: SlideId[];
  start: SlideId;
  scale: number;
}) {
  const n = slides.length;
  const trackRef = useRef<HTMLDivElement>(null);
  const startIdx = Math.max(0, slides.indexOf(start));
  const [idx, setIdx] = useState(startIdx);
  const idxRef = useRef(startIdx);
  const [paused, setPaused] = useState(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout>>();
  const reduced = usePrefersReducedMotion();

  // Open on the starting slide, before paint (no visible scroll from slide 1).
  useLayoutEffect(() => {
    const el = trackRef.current;
    if (el) el.scrollLeft = startIdx * el.clientWidth;
    // Mount only: the starting slide is fixed for this wall.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the current slide in place when the width changes (rotation, resize).
  useEffect(() => {
    const keep = () => {
      const el = trackRef.current;
      if (el) el.scrollLeft = idxRef.current * el.clientWidth;
    };
    window.addEventListener('resize', keep);
    return () => window.removeEventListener('resize', keep);
  }, []);

  const go = useCallback((i: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: ((i + n) % n) * el.clientWidth, behavior: reduced ? 'auto' : 'smooth' });
  }, [n, reduced]);

  function onScroll() {
    const el = trackRef.current;
    if (!el || !el.clientWidth) return;
    const i = Math.min(n - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth)));
    if (i !== idxRef.current) { idxRef.current = i; setIdx(i); }
  }

  // Interaction: pause now; resume after RESUME_MS of no interaction.
  const hold = useCallback(() => {
    clearTimeout(resumeTimer.current);
    setPaused(true);
  }, []);
  const release = useCallback(() => {
    clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setPaused(false), RESUME_MS);
  }, []);
  const nudge = useCallback(() => { hold(); release(); }, [hold, release]);
  useEffect(() => () => clearTimeout(resumeTimer.current), []);

  // Auto-advance: 4s on each slide, restarting whenever the slide changes.
  useEffect(() => {
    if (reduced || paused || n < 2) return;
    const t = setTimeout(() => go(idx + 1), ADVANCE_MS);
    return () => clearTimeout(t);
  }, [idx, paused, reduced, n, go]);

  const h = Math.round(SLIDE_H * scale);
  return (
    <section aria-roledescription="carousel" aria-label="What On It does">
      <div
        ref={trackRef}
        onScroll={onScroll}
        onTouchStart={hold}
        onTouchEnd={release}
        onTouchCancel={release}
        onPointerDown={(e) => { if (e.pointerType === 'mouse') hold(); }}
        onPointerUp={(e) => { if (e.pointerType === 'mouse') release(); }}
        onWheel={nudge}
        className="flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ height: h }}
      >
        {slides.map((id, i) => (
          <div
            key={id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${n}: ${SLIDE_TITLE[id].join(' ')}`}
            className="flex shrink-0 grow-0 basis-full snap-center snap-always justify-center overflow-hidden"
            style={{ height: h }}
          >
            <div className="shrink-0 select-none" style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${scale})`, transformOrigin: '50% 0' }}>
              <PaywallSlide id={id} />
            </div>
          </div>
        ))}
      </div>

      {/* Page dots: 7px marks, each with a larger invisible tap target. */}
      <div className="flex justify-center gap-1.5 pb-3.5 pt-2">
        {slides.map((id, i) => (
          <button
            key={id}
            type="button"
            aria-label={`Slide ${i + 1} of ${n}`}
            aria-current={i === idx ? 'true' : undefined}
            onClick={() => { nudge(); go(i); }}
            className="relative h-[7px] rounded-full outline-none transition-[width,background-color] duration-300 before:absolute before:-inset-x-1 before:-inset-y-3 before:content-[''] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            style={{ width: i === idx ? 20 : 7, background: i === idx ? '#d4af37' : '#e2d5bc' }}
          />
        ))}
      </div>
    </section>
  );
}
