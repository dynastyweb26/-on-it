'use client';
// The paywall's feature slideshow — the page's hero (PaywallModal sizes it to
// ~57% of the screen height). A native CSS scroll-snap carousel — no carousel
// library: swipe is the browser's own scrolling, the page dots and
// auto-advance just scroll the track.
//  - Auto-advance every 4s; any touch, drag, wheel or dot tap pauses it, and it
//    resumes after 6s with no interaction.
//  - prefers-reduced-motion: no auto-advance, and dot taps jump instead of
//    animating (swipes are the user's own scroll, so they stay).
//  - Opens on `start` (the feature the wall was hit on).
// Each slide is a live-text headline over the graphic. Both scale from
// `height`: the headline's size directly, the graphic (a fixed 393×216 canvas,
// DOM/SVG, crisp at any scale) by whatever is left, capped by the width so its
// objects never crop. On phones the width usually binds first; the leftover
// height goes around the headline + graphic pair, which stays centred.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  GRAPHIC_CONTENT_W, GRAPHIC_H, GRAPHIC_W, PaywallSlideGraphic, SLIDE_TITLE, type SlideId,
} from '@/components/paywall/PaywallSlides';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';

const ADVANCE_MS = 4000;
const RESUME_MS = 6000;
export const DOTS_H = 29; // the page-dot row under the slides (7px dots + padding)
const TITLE_LH = 1.1;
const TITLE_GAP = 6; // headline → graphic
const MAX_GRAPHIC_SCALE = 1.5;


/** Headline size and graphic scale for a hero `height` (dots included) and track `width`. */
function layout(height: number, width: number) {
  // 30px at an SE's hero, up to 40px on tall phones.
  const titleFs = Math.round(Math.min(40, Math.max(30, height * 0.095)));
  const titleH = Math.ceil(2 * titleFs * TITLE_LH) + TITLE_GAP;
  const area = Math.max(0, height - DOTS_H - titleH);
  const scale = Math.min(MAX_GRAPHIC_SCALE, area / GRAPHIC_H, width / GRAPHIC_CONTENT_W);
  return { titleFs, titleH, area, scale: Math.max(0.4, scale) };
}

export default function PaywallSlideshow({ slides, start, height }: {
  slides: SlideId[];
  start: SlideId;
  height: number;
}) {
  const n = slides.length;
  const trackRef = useRef<HTMLDivElement>(null);
  const startIdx = Math.max(0, slides.indexOf(start));
  const [idx, setIdx] = useState(startIdx);
  const idxRef = useRef(startIdx);
  const [paused, setPaused] = useState(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout>>();
  const reduced = usePrefersReducedMotion();
  const [width, setWidth] = useState(GRAPHIC_W);

  // Open on the starting slide, before paint (no visible scroll from slide 1).
  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    setWidth(el.clientWidth);
    el.scrollLeft = startIdx * el.clientWidth;
    // Mount only: the starting slide is fixed for this wall.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the current slide in place when the width changes (rotation, resize).
  useEffect(() => {
    const keep = () => {
      const el = trackRef.current;
      if (!el) return;
      setWidth(el.clientWidth);
      el.scrollLeft = idxRef.current * el.clientWidth;
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

  const { titleFs, titleH, scale } = layout(height, width);
  const slideH = height - DOTS_H;
  const gH = Math.round(GRAPHIC_H * scale);
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
        style={{ height: slideH }}
      >
        {slides.map((id, i) => (
          <div
            key={id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${n}: ${SLIDE_TITLE[id].join(' ')}`}
            className="flex shrink-0 grow-0 basis-full snap-center snap-always flex-col items-center justify-center overflow-hidden"
            style={{ height: slideH }}
          >
            <h2
              className="m-0 shrink-0 select-none text-center font-display font-extrabold text-on-background"
              style={{ fontSize: titleFs, lineHeight: TITLE_LH, letterSpacing: '-0.025em', height: titleH, paddingBottom: TITLE_GAP }}
            >
              {SLIDE_TITLE[id][0]}<br />{SLIDE_TITLE[id][1]}
            </h2>
            <div className="flex w-full shrink-0 justify-center overflow-hidden" style={{ height: gH }}>
              <div className="shrink-0">
                <div className="select-none" style={{ width: GRAPHIC_W, height: GRAPHIC_H, transform: `scale(${scale})`, transformOrigin: '50% 0' }}>
                  <PaywallSlideGraphic id={id} />
                </div>
              </div>
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
