'use client';
// Slide 1 — the opener: COLUMNS + RIBBON (RECAP-SPEC §4 / §5, decision 6 —
// corrected 2026-10-02; the horizon line was a spec mistake). The prototype's
// columns opener: weekly = 7 day columns, monthly = 4–6 calendar-week columns
// (Mon–Sun, clipped to the month; derived from the stored daily series). The
// columns rise in a wave, a ribbon of light sweeps across the tops, and the
// small swoosh riding the ribbon's head hands off (same spot, angle and size,
// same frame) to the big mark, which settles behind the title. No value label
// and no day/week labels. Zero columns stay as low stubs. Geometry:
// lib/recap/columns.ts.
//
// Layout: the text and the resting mark sit under the chrome at the
// prototype's sizes. The columns span the screen width with the design
// canvas's bottom on the screen's bottom; when the room under the text is
// short (an SE in Safari) they're squashed vertically so the tallest possible
// column and the ribbon stay under the affirmation — the same cap for every
// period, so a quiet period still stands lower than a busy one.
//
// Reduce Motion: no rise, sweep, rider or hand-off — columns, reflections and
// the resting mark fade in (350 ms), then the text.
import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useSlideAnims } from '@/components/recap/anim';
import type { SlideProps } from '@/components/recap/clock';
import { AFFIRMATIONS, monthName, periodLabel } from '@/components/recap/copy';
import { CANVAS_H, CANVAS_W, CEILING, payloadColumns } from '@/lib/recap/columns';

const HANDOFF = 0.85;              // share of the ribbon the head has covered at the hand-off
const HEAD_END = 0.625;            // eased sweep progress at which the head reaches the path end (100 of 160)
const TRAIL = [0.12, 0.26, 0.45];  // ribbon trail lengths (share of the path), core → glow
const RIDER_W = 54, RIDER_H = 43;
const MARK_W = 300, MARK_H = 237;
const TEXT_GAP = 24;               // between the affirmation and the highest possible column / ribbon
const AFF_BLOCK = 12 + 14 + 2 * 26;  // text gap + affirmation margin + two 26 px lines
const MIN_KY = 0.3;                // only an SE in Safari (548 px tall) gets near this

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
      // Fit against the text with the affirmation counted as two lines, not as
      // rendered: the affirmation rotates per open, and the columns must
      // stand at the same height on every open.
      const range = text.range.current;
      const textBottom = range ? t.offsetTop + range.offsetTop + range.offsetHeight + AFF_BLOCK : t.offsetTop + t.offsetHeight;
      const next = { w: root.clientWidth, h: root.clientHeight, textBottom };
      setLayout((l) => (l && l.w === next.w && l.h === next.h && l.textBottom === next.textBottom ? l : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    ro.observe(t);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={rootRef} className="absolute inset-0">
      {/* Rebuilt on a size change (rotation): its animations re-seek to the clock. */}
      {layout && <Columns key={`${layout.w}x${layout.h}x${layout.textBottom}`} {...props} layout={layout} text={text} />}
      <div ref={textRef} className="rc-opener-text">
        <div ref={text.label} className="rc-label">{month ? 'Monthly recap' : 'Weekly recap'}</div>
        <h1 ref={text.title} className="rc-opener-title">{month ? `Your ${monthName(payload)}, On It.` : 'Your week, On It.'}</h1>
        <div ref={text.range} className="rc-opener-range">{periodLabel(payload)}</div>
        <p ref={text.aff} className="rc-opener-aff">{AFFIRMATIONS[(Math.max(1, opens) - 1) % AFFIRMATIONS.length]}</p>
      </div>
    </div>
  );
}

function Columns({ payload, timing, clock, reduced, layout, text }: SlideProps & { layout: Layout; text: TextRefs }) {
  const { w, h, textBottom } = layout;
  const kx = w / CANVAS_W;
  const ky = Math.min(kx, Math.max(MIN_KY, (h - textBottom - TEXT_GAP) / (CANVAS_H - CEILING)));
  const oy = h - CANVAS_H * ky;
  const g = useMemo(() => payloadColumns(payload, kx, ky, oy), [payload, kx, ky, oy]);

  const colRefs = useRef<(HTMLDivElement | null)[]>([]);
  const reflRefs = useRef<(HTMLDivElement | null)[]>([]);
  const baseRef = useRef<HTMLDivElement>(null);
  const ribbonRef = useRef<SVGSVGElement>(null);
  const riderRef = useRef<HTMLDivElement>(null);
  const riderInRef = useRef<HTMLDivElement>(null);
  const markGateRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLDivElement>(null);

  useSlideAnims(clock, timing.B, reduced, (S) => {
    const B = timing.B;
    // Columns rise in a wave (back ease); reflections with them; the floor line fades in.
    colRefs.current.forEach((el, i) => S.anim(el, [{ opacity: 0, transform: 'scaleY(0)' }, { offset: 0.25, opacity: 1 }, { opacity: 1, transform: 'none' }], 'cols', { i }));
    reflRefs.current.forEach((el, i) => S.anim(el, [{ opacity: 0 }, { opacity: 0.5 }], 'cols', { i }));
    S.anim(baseRef.current, [{ opacity: 0 }, { opacity: 1 }], 'cols');
    // Ribbon: a trail window [head − L, head]; the head travels 0 → 160 so the trail leaves the screen.
    ribbonRef.current?.querySelectorAll('path').forEach((p) => {
      const L = parseFloat(p.getAttribute('stroke-dasharray') ?? '0'); // each stroke's own trail length
      S.anim(p, [{ strokeDashoffset: L }, { strokeDashoffset: L - 160 }], 'sweep', { kind: 'fx' });
    });
    // Rider on the head (reaches the path end at eased 62.5 %, like the prototype's spark);
    // visible from the sweep's start until the hand-off, gone 80 ms later.
    S.anim(riderRef.current, [{ offsetDistance: '0%' }, { offset: HEAD_END, offsetDistance: '100%' }, { offsetDistance: '100%' }], 'sweep', { kind: 'fx' });
    const span = B.mark.start + 80 - B.sweep.start;
    S.anim(riderInRef.current, [
      { opacity: 0 }, { offset: 40 / span, opacity: 1 },
      { offset: (B.mark.start - B.sweep.start) / span, opacity: 1 }, { opacity: 0 },
    ], 'sweep', { kind: 'fx', dur: span, ease: 'linear' });
    // The big mark: hidden until the hand-off, then it starts exactly on the
    // rider and settles behind the title.
    const gate = markGateRef.current, mark = markRef.current;
    if (gate && mark) {
      const at = B.mark.start;
      S.anim(gate, [{ opacity: 0 }, { opacity: 0, offset: 0.999 }, { opacity: 1 }], 'mark', { kind: 'fx', offset: -at, dur: at, ease: 'linear' });
      const p = g.pointAt(HANDOFF);
      const a = (p.angle * Math.PI) / 180, rh = RIDER_H * kx;
      // Rider centre: its anchor (bottom centre) on the ribbon, half its height "up" along its own rotation.
      const rx = p.x + Math.sin(a) * (rh / 2), ry = p.y - Math.cos(a) * (rh / 2);
      const mx = mark.offsetLeft + MARK_W / 2, my = mark.offsetTop + MARK_H / 2;
      S.anim(mark, [
        { opacity: 1, transform: `translate(${(rx - mx).toFixed(1)}px, ${(ry - my).toFixed(1)}px) rotate(${p.angle.toFixed(1)}deg) scale(${((RIDER_W * kx) / MARK_W).toFixed(3)})` },
        { opacity: 0.62, transform: 'none' },
      ], 'mark');
    }
    // Text, as in the prototype.
    S.fadeUp(text.label.current, 'label');
    S.fadeUp(text.title.current, 'title', { dy: 16 });
    S.fadeUp(text.range.current, 'range');
    S.fadeUp(text.aff.current, 'aff', { dy: 8 });
  });

  const stroke = { pathLength: 100, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <>
      <div className="rc-cols" aria-hidden>
        {g.cols.map((c, i) => {
          const r = c.w / 2;
          return c.zero ? (
            <div key={i} ref={(el) => { colRefs.current[i] = el; }} className="rc-col rc-col-stub"
              style={{ left: c.x, top: c.y, width: c.w, height: c.h, borderRadius: r }} />
          ) : (
            <div key={i} ref={(el) => { colRefs.current[i] = el; }} className="rc-col"
              style={{ left: c.x, top: c.y, width: c.w, height: c.h, borderRadius: `${r}px ${r}px 2px 2px` }} />
          );
        })}
        {g.cols.map((c, i) => (c.zero ? null : (
          <div key={`r${i}`} ref={(el) => { reflRefs.current[i] = el; }} className="rc-refl"
            style={{ left: c.x, top: g.base + 2, width: c.w, height: Math.min(40 * ky, c.h * 0.3), borderRadius: `2px 2px ${c.w / 2}px ${c.w / 2}px` }} />
        )))}
        <div ref={baseRef} className="rc-floor" style={{ top: g.base, left: 28 * kx, right: 28 * kx }} />
        <svg ref={ribbonRef} className="rc-ribbon" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          {/* Glow = stacked strokes, no blur filter (§9). Static state = the trail gone past the end. */}
          <path d={g.ribbon} {...stroke} stroke="#d4af37" strokeOpacity={0.14} strokeWidth={18 * kx} strokeDasharray={`${TRAIL[2] * 100} 300`} strokeDashoffset={TRAIL[2] * 100 - 160} />
          <path d={g.ribbon} {...stroke} stroke="#e8c766" strokeOpacity={0.45} strokeWidth={6 * kx} strokeDasharray={`${TRAIL[1] * 100} 300`} strokeDashoffset={TRAIL[1] * 100 - 160} />
          <path d={g.ribbon} {...stroke} stroke="#fff1c9" strokeWidth={3 * kx} strokeDasharray={`${TRAIL[0] * 100} 300`} strokeDashoffset={TRAIL[0] * 100 - 160} />
        </svg>
        {!reduced && (
          <div ref={riderRef} className="rc-rider" style={{ width: RIDER_W * kx, height: RIDER_H * kx, offsetPath: `path('${g.ribbon}')` }}>
            <div ref={riderInRef} className="rc-rider-in">
              <div className="rc-glow" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/recap/swoosh-gold.svg" alt="" draggable={false} />
            </div>
          </div>
        )}
      </div>

      {/* The resting mark behind the title (the gate hides it until the hand-off). */}
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
