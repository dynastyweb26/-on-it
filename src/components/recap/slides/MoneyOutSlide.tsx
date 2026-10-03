'use client';
// Slide 3 — Money out (RECAP-SPEC §5 "moneyOut"; the prototype's slides.js
// moneyOut), dark: "You spent" + the total counting up; up to three receipts
// flutter in from above (zig-zag, torn bottoms); the category ring draws one
// segment after another across the linear ring beat (each segment's slice of
// time = its share) with the top category's name and % in the centre; the
// legend; then "Most of it at {store}" with a bar per trip.
//
// Colours: by category rank (lib/recap/categories.ts). The prototype's
// blurred glow under the first ring segment is a wider, faint stroke instead
// (no blur filter, §9). No tax / deductible wording.
//
// Reduce Motion: receipts, ring, legend and card fade; the total is final.
import { useRef } from 'react';
import { useSlideAnims } from '@/components/recap/anim';
import type { SlideProps } from '@/components/recap/clock';
import { money } from '@/components/recap/copy';
import { fitContent, fitText } from '@/components/recap/fit';
import { categoryColors, categoryLabel, ringSegments } from '@/lib/recap/categories';

const TILT = [-5, 4, -2];          // receipts' resting rotation
const R = 72, C = 88;              // ring radius / centre (176 px box)

export default function MoneyOutSlide({ payload: d, timing, clock, reduced }: SlideProps) {
  const cats = d.spend.categories;
  const color = categoryColors(d);
  const ring = ringSegments(cats.map((c) => c.amount));
  const tot = cats.reduce((a, c) => a + c.amount, 0) || 1;
  const top = cats[0];
  const receipts = d.spend.receipts.slice(0, 3);
  const v = d.topVendor;
  const trips = v ? (v.tripCount === 1 ? 'in one trip' : `across ${v.tripCount} trips`) : '';

  const boxRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const leadRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<SVGCircleElement>(null);
  const segRefs = useRef<(SVGCircleElement | null)[]>([]);
  const rcRefs = useRef<(HTMLDivElement | null)[]>([]);
  const tripRefs = useRef<(HTMLElement | null)[]>([]);

  useSlideAnims(clock, timing.B, reduced, (S) => {
    fitText(heroRef.current, money(d.spend.total));
    fitContent(boxRef.current);
    S.fadeUp(labelRef.current, 'label');
    S.fadeUp(leadRef.current, 'lead');
    S.number(heroRef.current, d.spend.total, 'count', money);
    rcRefs.current.forEach((w, i) => {
      const dir = i % 2 ? 1 : -1, fr = TILT[i];
      S.anim(w, [
        { opacity: 0, transform: `translate(${dir * 50}px,-150px) rotate(${fr + dir * 30}deg)` },
        { offset: 0.35, opacity: 1, transform: `translate(${-dir * 16}px,-62px) rotate(${fr - dir * 14}deg)` },
        { offset: 0.7, transform: `translate(${dir * 6}px,-12px) rotate(${fr + dir * 5}deg)` },
        { opacity: 1, transform: `rotate(${fr}deg)` },
      ], 'receipts', { i });
    });
    const B = timing.B.ring;
    segRefs.current.forEach((c, i) => {
      const s = ring[i];
      // Hidden until its own draw starts (an undrawn segment otherwise leaves a hairline).
      S.anim(c, [{ strokeDashoffset: s.vis, opacity: 0 }, { offset: 0.01, opacity: 1 }, { strokeDashoffset: 0, opacity: 1 }], 'ring', { offset: (B.dur * s.start) / 100, dur: Math.max(120, (B.dur * s.len) / 100), kind: 'move' });
      if (reduced) S.anim(c, [{ opacity: 0 }, { opacity: 1 }], 'ring');
    });
    if (ring[0]) {
      S.anim(glowRef.current, [{ strokeDashoffset: ring[0].vis, opacity: 0 }, { offset: 0.01, opacity: 1 }, { strokeDashoffset: 0, opacity: 1 }], 'ring', { dur: Math.max(120, (B.dur * ring[0].len) / 100), kind: 'move' });
      if (reduced) S.anim(glowRef.current, [{ opacity: 0 }, { opacity: 1 }], 'ring');
    }
    S.fadeUp(centerRef.current, 'center', { dy: 6 });
    S.fadeUp(legendRef.current, 'legend');
    S.fadeUp(cardRef.current, 'card', { dy: 16 });
    tripRefs.current.forEach((t, i) => S.grow(t, 'trips', 'X', { i }));
  });

  return (
    <div className="absolute inset-0">
      <div ref={boxRef} className="rc-content">
        <div ref={labelRef} className="rc-label">Money out</div>
        <div ref={leadRef} className="rc-lead">You spent</div>
        <div ref={heroRef} className="rc-hero">{money(reduced ? d.spend.total : 0)}</div>
        <div className="rc-outrow">
          <div className="rc-ringbox" role="img" aria-label={cats.map((c) => `${categoryLabel(c.key)} ${money(c.amount)}`).join(', ')}>
            <svg width={176} height={176} viewBox="0 0 176 176" aria-hidden>
              <circle cx={C} cy={C} r={R} fill="none" stroke="rgba(255,248,240,.06)" strokeWidth={16} />
              {ring[0] && (
                // Glow under the top category: a wider, faint stroke (no blur).
                <circle ref={glowRef} cx={C} cy={C} r={R} fill="none" stroke={color(cats[0].key)} strokeOpacity={0.18} strokeWidth={34}
                  pathLength={100} strokeDasharray={`${ring[0].vis.toFixed(2)} 100`} />
              )}
              {ring.map((s, i) => (
                <circle key={cats[i].key} ref={(el) => { segRefs.current[i] = el; }} cx={C} cy={C} r={R} fill="none"
                  transform={`rotate(${(s.start * 3.6).toFixed(2)} ${C} ${C})`} stroke={color(cats[i].key)} strokeWidth={s.width}
                  pathLength={100} strokeDasharray={`${s.vis.toFixed(2)} 100`} />
              ))}
            </svg>
            {top && (
              <div ref={centerRef} className="rc-ringcenter">
                <span>{categoryLabel(top.key)}</span>
                <b>{Math.round((top.amount / tot) * 100)}%</b>
              </div>
            )}
          </div>
          <div className="rc-receipts">
            {receipts.map((r, i) => (
              <div key={i} ref={(el) => { rcRefs.current[i] = el; }} className="rc-rcw" style={{ top: i * 59, transform: `rotate(${TILT[i]}deg)` }}>
                <div className="rc-receipt" style={{ ['--c' as string]: color(r.category) }}>
                  <span><i />{r.vendor || categoryLabel(r.category)}</span>
                  <b>{money(r.amount)}</b>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div ref={legendRef} className="rc-legend">
          {cats.map((c) => (
            <span key={c.key} style={{ ['--c' as string]: color(c.key) }}><i />{categoryLabel(c.key)} <b>{money(c.amount)}</b></span>
          ))}
        </div>
        <div className="rc-spacer" />
        {v && (
          <div ref={cardRef} className="rc-card-dark rc-vendor">
            <div>Most of it at <span className="rc-name">{v.name}</span>: {money(v.amount)} {trips}.</div>
            <div className="rc-trips">
              {v.trips.map((t, i) => (
                <i key={i} ref={(el) => { tripRefs.current[i] = el; }} style={{ width: `${((t / Math.max(1, v.amount)) * 78).toFixed(2)}%`, background: color(v.category) }} />
              ))}
              <em />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
