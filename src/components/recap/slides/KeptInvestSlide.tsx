'use client';
// Slide 4 (variant) — What you kept, investment week (RECAP-SPEC §5
// "keptInvest"; the prototype's slides.js keptInvest), light, when net < 0
// or income = 0: "This week was an investment week.", "Net this week" with
// the net counting up (−$480), two 16 px bars — Brought in (gold) and Spent
// (one piece per category, in its colour) — widths relative to the larger,
// and "Most went to {category}: $X". Calm: no ring, no glow, a soft chime.
//
// Reduce Motion: fades only, final net.
import { useRef } from 'react';
import { useSlideAnims } from '@/components/recap/anim';
import type { SlideProps } from '@/components/recap/clock';
import { money, per } from '@/components/recap/copy';
import { fitContent, fitText } from '@/components/recap/fit';
import { categoryColors, categoryLabel } from '@/lib/recap/categories';

export default function KeptInvestSlide({ payload: d, timing, clock, reduced }: SlideProps) {
  const p = per(d);
  const cats = d.spend.categories;
  const color = categoryColors(d);
  const top = cats[0];
  const mx = Math.max(d.income.total, d.spend.total) || 1;

  const boxRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const kvRef = useRef<HTMLDivElement>(null);
  const netRef = useRef<HTMLSpanElement>(null);
  const inRef = useRef<HTMLElement>(null);
  const outRefs = useRef<(HTMLElement | null)[]>([]);
  const chipRef = useRef<HTMLDivElement>(null);

  useSlideAnims(clock, timing.B, reduced, (S) => {
    fitText(netRef.current, money(d.net));
    fitContent(boxRef.current);
    S.fadeUp(labelRef.current, 'label');
    S.fadeUp(titleRef.current, 'title', { dy: 16 });
    S.fadeUp(kvRef.current, 'count', { dur: 400 });
    S.number(netRef.current, d.net, 'count', money);
    S.grow(inRef.current, 'inBar');
    outRefs.current.forEach((b, i) => S.grow(b, 'outBars', 'X', { i }));
    S.fadeUp(chipRef.current, 'chip', { dy: 8 });
  });

  return (
    <div className="absolute inset-0">
      <div ref={boxRef} className="rc-content">
        <div ref={labelRef} className="rc-label">What you kept</div>
        <h2 ref={titleRef} className="rc-h2">This {p} was an investment {p}.</h2>
        <div ref={kvRef} className="rc-kv">
          <span className="rc-cap" style={{ margin: 0, fontSize: 14 }}>Net this {p}</span>
          <span ref={netRef} className="rc-knet">{money(reduced ? d.net : 0)}</span>
        </div>
        <div className="rc-kbars">
          <div className="rc-kbar">
            <div className="rc-kbar-h"><span>Brought in</span><span>{money(d.income.total)}</span></div>
            <div className="rc-bar16">
              <i ref={inRef} className="rc-kin" style={{ width: `${(d.income.total / mx) * 100}%` }} />
            </div>
          </div>
          <div className="rc-kbar">
            <div className="rc-kbar-h"><span>Spent</span><span>{money(d.spend.total)}</span></div>
            <div className="rc-bar16" role="img" aria-label={cats.map((c) => `${categoryLabel(c.key)} ${money(c.amount)}`).join(', ')}>
              {cats.map((c, i) => (
                <i key={c.key} ref={(el) => { outRefs.current[i] = el; }} style={{ width: `calc(${(c.amount / mx) * 100}% - 2px)`, background: color(c.key) }} />
              ))}
            </div>
          </div>
        </div>
        {top && (
          <div ref={chipRef} className="rc-kchip-row">
            <div className="rc-chip flat rc-kchip">
              <i style={{ background: color(top.key) }} />
              Most went to {categoryLabel(top.key)}: {money(top.amount)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
