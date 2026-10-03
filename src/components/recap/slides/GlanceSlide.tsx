'use client';
// Monthly only — Month at a glance (RECAP-SPEC §5 "glance"; the prototype's
// slides.js glance), light, after What you kept: the month's name, "Your
// month at a glance", "$X brought in over N weeks" (counting up); one bar per
// week (monthWeeks: 1–7, 8–14, 15–21, 22–end) growing up, the best week in
// gold with a glow, values above and labels below; the "Best week" card.
//
// Reduce Motion: fades only, final total.
import { useRef } from 'react';
import { useSlideAnims } from '@/components/recap/anim';
import type { SlideProps } from '@/components/recap/clock';
import { money, monthName } from '@/components/recap/copy';
import { fitContent } from '@/components/recap/fit';
import { monthWeeks } from '@/lib/recap/payload';

const MAX_BAR = 230;

export default function GlanceSlide({ payload: d, timing, clock, reduced }: SlideProps) {
  const weeks = monthWeeks(d);
  const mx = Math.max(0, ...weeks.map((w) => w.amount)) || 1;
  const best = weeks.find((w) => w.amount === mx) ?? weeks[0];

  const boxRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const totalRef = useRef<HTMLElement>(null);
  const barRefs = useRef<(HTMLDivElement | null)[]>([]);
  const valRefs = useRef<(HTMLElement | null)[]>([]);
  const cardRef = useRef<HTMLDivElement>(null);

  useSlideAnims(clock, timing.B, reduced, (S) => {
    fitContent(boxRef.current);
    S.fadeUp(labelRef.current, 'label');
    S.fadeUp(titleRef.current, 'title', { dy: 16 });
    S.fadeUp(subRef.current, 'sub');
    S.number(totalRef.current, d.income.total, 'total', money);
    barRefs.current.forEach((b, i) => S.grow(b, 'bars', 'Y', { i }));
    valRefs.current.forEach((b, i) => S.fadeUp(b, 'vals', { i, dy: 6 }));
    S.fadeUp(cardRef.current, 'card', { dy: 16 });
  });

  return (
    <div className="absolute inset-0">
      <div ref={boxRef} className="rc-content">
        <div ref={labelRef} className="rc-label">{monthName(d)}</div>
        <h2 ref={titleRef} className="rc-h2">Your month at a glance</h2>
        <div ref={subRef} className="rc-gsub">
          <b ref={totalRef}>{money(reduced ? d.income.total : 0)}</b> brought in over {weeks.length} weeks
        </div>
        <div className="rc-gbars" role="img" aria-label={weeks.map((w) => `${w.label} ${money(w.amount)}`).join(', ')}>
          {weeks.map((w, i) => (
            <div key={w.start} className="rc-gcol">
              <b ref={(el) => { valRefs.current[i] = el; }}>{money(w.amount)}</b>
              <div ref={(el) => { barRefs.current[i] = el; }} className={`rc-gbar${w === best ? ' best' : ''}`} style={{ height: Math.max(2, (w.amount / mx) * MAX_BAR) }} />
            </div>
          ))}
        </div>
        <div className="rc-glbl">{weeks.map((w) => <span key={w.start}>{w.label}</span>)}</div>
        <div className="rc-spacer" />
        <div ref={cardRef} className="rc-best">
          <small>Best week</small>
          <b>{best.label}, {money(best.amount)}</b>
        </div>
      </div>
    </div>
  );
}
