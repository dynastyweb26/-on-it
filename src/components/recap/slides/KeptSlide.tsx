'use client';
// Slide 4 — What you kept (RECAP-SPEC §5 "kept"; the prototype's slides.js
// kept), light, when net ≥ 0 and income > 0: a 300 px gold ring fills to
// net / income while the net counts up on the same 2000 ms beat, a cream spark
// riding the arc head; "of $X brought in"; the change chip pops; foot
// "$X in · $Y out".
//
// The prototype's blurred glow copy of the arc is a wider, faint stroke (no
// blur filter, §9). The change chip is success-tinted when up and neutral
// when down or flat — never red; it's hidden when there's nothing to compare
// with.
//
// Reduce Motion: ring, numbers and chip fade in at their final state; no spark.
import { useId, useRef } from 'react';
import Icon from '@/components/Icon';
import { useSlideAnims } from '@/components/recap/anim';
import type { SlideProps } from '@/components/recap/clock';
import { changeLine, money } from '@/components/recap/copy';
import { fitContent, fitText } from '@/components/recap/fit';

const ARC = 'M150 22 A128 128 0 1 1 149.99 22';   // the ring's path from 12 o'clock, for the spark

export default function KeptSlide({ payload: d, timing, clock, reduced }: SlideProps) {
  const f = Number(((Math.max(0, d.net) / Math.max(1, d.income.total)) * 100).toFixed(2));
  const change = changeLine(d);
  const gradId = `rc-kg-${useId().replace(/:/g, '')}`;

  const boxRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const leadRef = useRef<HTMLDivElement>(null);
  const arcRef = useRef<SVGCircleElement>(null);
  const glowRef = useRef<SVGCircleElement>(null);
  const sparkRef = useRef<HTMLDivElement>(null);
  const numRef = useRef<HTMLDivElement>(null);
  const capRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLDivElement>(null);
  const footRef = useRef<HTMLDivElement>(null);

  useSlideAnims(clock, timing.B, reduced, (S) => {
    fitText(numRef.current, money(d.net));
    fitContent(boxRef.current);
    S.fadeUp(labelRef.current, 'label');
    S.fadeUp(leadRef.current, 'lead');
    S.anim(arcRef.current, [{ strokeDashoffset: f, opacity: 0 }, { offset: 0.04, opacity: 1 }, { strokeDashoffset: 0, opacity: 1 }], 'ring');
    S.anim(glowRef.current, [{ strokeDashoffset: f, opacity: 0 }, { offset: 0.04, opacity: 1 }, { strokeDashoffset: 0, opacity: 1 }], 'ring');
    S.anim(sparkRef.current, [{ offsetDistance: '0%', opacity: 0 }, { offset: 0.05, opacity: 1 }, { offset: 0.92, opacity: 1 }, { offsetDistance: `${f}%`, opacity: 0 }], 'ring', { kind: 'fx' });
    S.number(numRef.current, d.net, 'ring', money);
    S.fadeUp(capRef.current, 'caption', { dy: 6 });
    S.pop(chipRef.current, 'chip');
    S.fadeUp(footRef.current, 'foot');
  });

  return (
    <div className="absolute inset-0">
      <div ref={boxRef} className="rc-content rc-center">
        <div ref={labelRef} className="rc-label">What you kept</div>
        <div ref={leadRef} className="rc-lead">You kept</div>
        <div className="rc-keptring" role="img" aria-label={`${money(d.net)} of ${money(d.income.total)} brought in`}>
          <svg width={300} height={300} viewBox="0 0 300 300" aria-hidden>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#f1d57c" />
                <stop offset="0.55" stopColor="#d4af37" />
                <stop offset="1" stopColor="#b8952a" />
              </linearGradient>
            </defs>
            <circle cx={150} cy={150} r={128} fill="none" stroke="var(--onit-track)" strokeWidth={24} />
            <g transform="rotate(-90 150 150)">
              {/* Glow: a wider, faint copy of the arc (no blur filter, §9). */}
              <circle ref={glowRef} cx={150} cy={150} r={128} fill="none" stroke="#d4af37" strokeOpacity={0.16} strokeWidth={40} strokeLinecap="round" pathLength={100} strokeDasharray={`${f} 100`} />
              <circle ref={arcRef} cx={150} cy={150} r={128} fill="none" stroke={`url(#${gradId})`} strokeWidth={24} strokeLinecap="round" pathLength={100} strokeDasharray={`${f} 100`} />
            </g>
          </svg>
          {!reduced && <div ref={sparkRef} className="rc-spark" style={{ offsetPath: `path('${ARC}')`, offsetDistance: `${f}%` }} />}
          <div className="rc-keptin">
            <div ref={numRef} className="rc-keptnum">{money(reduced ? d.net : 0)}</div>
            <div ref={capRef} className="rc-cap" style={{ margin: 0, fontSize: 14 }}>of {money(d.income.total)} brought in</div>
          </div>
        </div>
        {change && (
          <div ref={chipRef} className={`rc-chip ${change.dir === 'up' ? 'up' : 'flat'}`} style={{ marginTop: 36 }}>
            <Icon name={change.dir === 'up' ? 'trending_up' : change.dir === 'down' ? 'trending_down' : 'trending_flat'} size={20} />
            {change.text}
          </div>
        )}
        <div className="rc-spacer" />
        <div ref={footRef} className="rc-foot">{money(d.income.total)} in · {money(d.spend.total)} out</div>
      </div>
    </div>
  );
}
