'use client';
// Stand-in for a slide that isn't built yet (commit 3 = the player shell
// only). It runs on the real clock and the real resolved timing: the title
// rises on the slide's first beat and a bar fills over the HERO phase, so the
// progress segment visibly starts only once the hero is done. Each later
// commit replaces one of these with the real slide.
import { useRef } from 'react';
import { RECAP_SLIDE_NAMES } from '@/components/recap/names';
import { useClock, type SlideProps } from '@/components/recap/clock';
import { useSlideAnims } from '@/components/recap/anim';

export default function PlaceholderSlide({ payload, timing, clock, reduced, index, count }: SlideProps) {
  const titleRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const first = Object.entries(timing.B).sort((a, b) => a[1].start - b[1].start)[0]?.[0];

  useSlideAnims(clock, timing.B, reduced, (S) => {
    if (!first) return;
    S.fadeUp(titleRef.current, first);
    S.fadeUp(bodyRef.current, first, { offset: 150 });
  });
  useClock(clock, (t) => {
    if (barRef.current) barRef.current.style.transform = `scaleX(${Math.min(1, t / timing.heroEnd)})`;
  });

  const dark = timing.theme === 'dark';
  return (
    <div className="absolute inset-x-7 top-[calc(var(--rc-top)+120px)] flex flex-col gap-3">
      <div ref={titleRef} className="font-display text-[30px] font-extrabold leading-[1.1] tracking-[-0.02em]">
        {RECAP_SLIDE_NAMES[timing.key]}
      </div>
      <div ref={bodyRef} className={`text-[15px] leading-[22px] ${dark ? 'text-[#e9dfcc]' : 'text-[#4d4635]'}`}>
        Slide {index + 1} of {count} · {payload.kind === 'month' ? 'Monthly' : 'Weekly'} · {payload.start} → {payload.end}
        <br />
        Hero {timing.heroEnd} ms · total {timing.duration} ms · {timing.cues.filter((c) => !c.silent).length} sound cues
        <br />
        <span className="opacity-70">Placeholder: the real slide lands in its own commit.</span>
      </div>
      <div className={`mt-2 h-1.5 overflow-hidden rounded-full ${dark ? 'bg-white/10' : 'bg-black/10'}`} aria-hidden>
        <div ref={barRef} className="h-full origin-left bg-[#d4af37]" style={{ transform: 'scaleX(0)' }} />
      </div>
      <div className={`text-[12px] ${dark ? 'text-[#cfc3ad]' : 'text-[#4d4635]'}`}>Hero phase (the progress bar waits for this)</div>
    </div>
  );
}
