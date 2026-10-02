'use client';
// Slide 1 — the opener: HORIZON LINE (RECAP-SPEC §4 / §5, decided 2026-10-02).
// One glowing curve of daily income with a molten-gold fill under it; a small
// swoosh rides the drawing tip and, at 85 % of the line, hands off to the big
// mark, which flies to its rest behind the title. No bars, labels, numbers or
// axes. Geometry: lib/recap/horizon.ts (the prototype's shapes.horizon).
//
// Layout: the text and the resting mark sit under the chrome at the
// prototype's sizes. The horizon spans the screen width with the design
// canvas's bottom on the screen's bottom; when the room under the text is
// short (an SE in Safari) it is squashed vertically so its highest possible
// peak stays under the affirmation — the same cap for every period, so a quiet
// period still reads lower than a busy one. It's drawn in screen px (points
// mapped, not an SVG scale), so strokes and the rider stay round, and the
// hand-off is computed from both elements' real positions.
//
// Reduce Motion: no draw, no rider, no lift — line, fill, haze and the resting
// mark fade in (350 ms), then the text.
import { useId, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useSlideAnims } from '@/components/recap/anim';
import type { SlideProps } from '@/components/recap/clock';
import { AFFIRMATIONS, monthName, periodLabel } from '@/components/recap/copy';
import { CANVAS_H, CANVAS_W, HORIZON_CEILING, payloadHorizon, screenHorizon } from '@/lib/recap/horizon';

const HANDOFF = 0.85;            // the line head's share of the line when the lift starts
const RIDER_W = 54, RIDER_H = 43;
const MARK_W = 300, MARK_H = 237;
const TEXT_GAP = 24;             // between the affirmation and the highest possible peak
const MIN_KY = 0.3;              // only an SE in Safari (548 px tall) gets near this

type Layout = { w: number; h: number; textBottom: number };
type TextRefs = {
  label: RefObject<HTMLDivElement>; title: RefObject<HTMLHeadingElement>;
  range: RefObject<HTMLDivElement>; aff: RefObject<HTMLParagraphElement>;
};

export default function OpenerSlide(props: SlideProps) {
  const { payload, opens } = props;
  const month = payload.kind === 'month';
  const rootRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const text: TextRefs = { label: useRef(null), title: useRef(null), range: useRef(null), aff: useRef(null) };
  const [layout, setLayout] = useState<Layout | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current, t = textRef.current;
    if (!root || !t) return;
    const measure = () => {
      const next = { w: root.clientWidth, h: root.clientHeight, textBottom: t.offsetTop + t.offsetHeight };
      setLayout((l) => (l && l.w === next.w && l.h === next.h && l.textBottom === next.textBottom ? l : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    ro.observe(t);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={rootRef} className="absolute inset-0">
      {/* Rebuilt on a size change (rotation): its animations re-seek to the clock. */}
      {layout && <Horizon key={`${layout.w}x${layout.h}x${layout.textBottom}`} {...props} layout={layout} text={text} />}
      <div ref={textRef} className="rc-opener-text">
        <div ref={text.label} className="rc-label">{month ? 'Monthly recap' : 'Weekly recap'}</div>
        <h1 ref={text.title} className="rc-opener-title">{month ? `Your ${monthName(payload)}, On It.` : 'Your week, On It.'}</h1>
        <div ref={text.range} className="rc-opener-range">{periodLabel(payload)}</div>
        <p ref={text.aff} className="rc-opener-aff">{AFFIRMATIONS[(Math.max(1, opens) - 1) % AFFIRMATIONS.length]}</p>
      </div>
    </div>
  );
}

function Horizon({ payload, timing, clock, reduced, layout, text }: SlideProps & { layout: Layout; text: TextRefs }) {
  const { w, h, textBottom } = layout;
  const kx = w / CANVAS_W;
  const ky = Math.min(kx, Math.max(MIN_KY, (h - textBottom - TEXT_GAP) / (CANVAS_H - HORIZON_CEILING)));
  const oy = h - CANVAS_H * ky;
  const sh = useMemo(() => screenHorizon(payloadHorizon(payload), kx, ky, oy, h), [payload, kx, ky, oy, h]);
  const gradId = `rc-hz-${useId().replace(/:/g, '')}`;

  const lineRef = useRef<SVGSVGElement>(null);
  const fillRef = useRef<SVGSVGElement>(null);
  const hazeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const riderRef = useRef<HTMLDivElement>(null);
  const markGateRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLDivElement>(null);

  useSlideAnims(clock, timing.B, reduced, (S) => {
    // Line: drawn left → right (all three strokes); a fade under Reduce Motion.
    S.anim(lineRef.current, [{ opacity: 0 }, { opacity: 1 }], 'line', { dur: 1 });
    lineRef.current?.querySelectorAll('path').forEach((p) => S.anim(p, [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }], 'line', { kind: 'fx' }));
    // Rider on the drawing tip; gone in the first 80 ms of the lift.
    S.anim(riderRef.current, [{ offsetDistance: '0%' }, { offsetDistance: '100%' }], 'line', { kind: 'fx' });
    S.anim(riderRef.current, [{ opacity: 1 }, { opacity: 0 }], 'lift', { kind: 'fx', dur: 80 });
    // The big mark: hidden until the lift, then it starts exactly on the rider
    // (same spot, angle and size) and flies to its rest behind the title.
    const gate = markGateRef.current, mark = markRef.current;
    if (gate && mark) {
      const startAt = timing.B.lift.start;
      S.anim(gate, [{ opacity: 0 }, { opacity: 0, offset: 0.999 }, { opacity: 1 }], 'lift', { kind: 'fx', offset: -startAt, dur: startAt, ease: 'linear' });
      const p = sh.pointAt(HANDOFF);
      const a = (p.angle * Math.PI) / 180, rh = RIDER_H * kx;
      // Rider centre: its anchor (bottom centre) on the line, half its height "up" along its own rotation.
      const rx = p.x + Math.sin(a) * (rh / 2), ry = p.y - Math.cos(a) * (rh / 2);
      const mx = mark.offsetLeft + MARK_W / 2, my = mark.offsetTop + MARK_H / 2;
      S.anim(mark, [
        { opacity: 1, transform: `translate(${(rx - mx).toFixed(1)}px, ${(ry - my).toFixed(1)}px) rotate(${p.angle.toFixed(1)}deg) scale(${((RIDER_W * kx) / MARK_W).toFixed(3)})` },
        { opacity: 0.62, transform: 'none' },
      ], 'lift');
    }
    // Fill rises gently; haze glows in after it starts.
    S.anim(fillRef.current, [{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'none' }], 'fill');
    hazeRefs.current.forEach((el) => S.anim(el, [{ opacity: 0 }, { opacity: 1 }], 'haze'));
    // Text, as in the prototype.
    S.fadeUp(text.label.current, 'label');
    S.fadeUp(text.title.current, 'title', { dy: 16 });
    S.fadeUp(text.range.current, 'range');
    S.fadeUp(text.aff.current, 'aff', { dy: 8 });
  });

  const hazes = [sh.peak, sh.second].filter((p): p is NonNullable<typeof p> => !!p);
  const stroke = { pathLength: 100, strokeDasharray: '100 101', strokeDashoffset: 0, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <>
      <div className="rc-hz" aria-hidden>
        {hazes.map((p, i) => (
          <div
            key={i}
            ref={(el) => { hazeRefs.current[i] = el; }}
            className="rc-haze"
            style={{ left: p.x - 160 * kx, top: p.y - 70 * ky - 110 * kx, width: 320 * kx, height: 220 * kx, transform: i ? 'scale(.6)' : undefined }}
          />
        ))}
        <svg ref={fillRef} className="rc-hz-svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ opacity: sh.zero ? 0.5 : 1 }}>
          <defs>
            <linearGradient id={gradId} gradientUnits="userSpaceOnUse" x1="0" y1={sh.top} x2="0" y2={h}>
              <stop offset="0" stopColor="rgba(240,205,110,.55)" />
              <stop offset="0.4" stopColor="rgba(212,175,55,.22)" />
              <stop offset="1" stopColor="rgba(212,175,55,0)" />
            </linearGradient>
          </defs>
          <path d={sh.area} fill={`url(#${gradId})`} />
        </svg>
        <svg ref={lineRef} className="rc-hz-svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          {/* Glow = stacked strokes, no blur filter (§9). Static state = fully drawn. */}
          <path d={sh.d} {...stroke} stroke="#d4af37" strokeOpacity={0.14} strokeWidth={16 * kx} />
          <path d={sh.d} {...stroke} stroke="#e8c766" strokeOpacity={0.5} strokeWidth={6 * kx} />
          <path d={sh.d} {...stroke} stroke="#fff1c9" strokeWidth={3 * kx} />
        </svg>
        {!reduced && (
          <div ref={riderRef} className="rc-rider" style={{ width: RIDER_W * kx, height: RIDER_H * kx, offsetPath: `path('${sh.d}')` }}>
            <div className="rc-glow" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/recap/swoosh-gold.svg" alt="" draggable={false} />
          </div>
        )}
      </div>

      {/* The resting mark behind the title (the gate hides it until the lift). */}
      <div ref={markGateRef} className="rc-mark-gate" aria-hidden>
        <div ref={markRef} className="rc-mark-box" style={{ width: MARK_W, height: MARK_H }}>
          <div className="rc-glow" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/recap/swoosh-gold.svg" alt="" draggable={false} />
        </div>
      </div>
    </>
  );
}
