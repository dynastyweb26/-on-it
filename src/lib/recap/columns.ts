// The opener's columns + ribbon (RECAP-SPEC §5 "opener", decision 6): the
// prototype's columns opener (slides.js), one column per day, with the On It
// build's rules — heights scaled against the previous period (a quiet period
// stands lower than a busy one), zero days as small stubs (never invisible),
// no day labels and no value label. Pure geometry; the slide draws it.
//
// Authored on the prototype's 393 × 852 canvas, then mapped to the screen:
// x × kx, y → oy + y × ky. The ribbon is a Catmull-Rom → cubic Bézier through
// the column tops; an affine map of its control points maps the curve exactly,
// so it's built straight in screen px (strokes and the rider stay round).
import type { RecapPayload } from '@/lib/recap/payload';

export const CANVAS_W = 393;
export const CANVAS_H = 852;
export const BASE = 748;          // column floor (prototype)
export const MAXH = 210;          // tallest column at full height
const L0 = 28, SPAN_W = 337;      // the row of columns: x 28 → 365
const WEEK_COL = 30;              // prototype column width (≤ 7 columns)
const GAP_RATIO = 0.35;           // monthly: gap = 0.35 × column width
const MIN_H = 14;                 // the smallest real day
export const STUB_H = 6;          // a zero day: a low stub, never invisible
const RIBBON_LIFT = 22;           // ribbon rides 22 px above the column tops
const NO_REF_AMP = 0.75;
/** The highest anything reaches (a full column + ribbon + its glow): the
 *  fitting reference, the same for every period so heights stay comparable. */
export const CEILING = BASE - MAXH - RIBBON_LIFT - 10;

/** amp = 0.4 + 0.6 × min(1, avg / ref), ref = the previous period's average
 *  daily income; no previous income → 0.75. */
export function columnsAmp(daily: number[], previousIncome: number | null | undefined): number {
  const n = daily.length || 1;
  const avg = daily.reduce((a, b) => a + b, 0) / n;
  const ref = previousIncome && previousIncome > 0 ? previousIncome / n : 0;
  return ref ? 0.4 + 0.6 * Math.min(1, avg / ref) : NO_REF_AMP;
}

export type Col = { x: number; w: number; h: number; zero: boolean };   // canvas px; top = BASE − h

/** One column per day, on the canvas. */
export function buildColumns(daily: number[], previousIncome: number | null | undefined): { cols: Col[]; amp: number } {
  const n = Math.max(1, daily.length);
  const mx = Math.max(0, ...daily);
  const amp = mx > 0 ? columnsAmp(daily, previousIncome) : 0;
  const w = n <= 7 ? WEEK_COL : SPAN_W / (n + GAP_RATIO * (n - 1));
  const gap = n > 1 ? (SPAN_W - n * w) / (n - 1) : 0;
  const cols = daily.map((v, i) => {
    const zero = !(v > 0);
    return { x: L0 + i * (w + gap), w, h: zero ? STUB_H : Math.max(MIN_H, (v / mx) * MAXH * amp), zero };
  });
  return { cols, amp };
}

export type Pt = { x: number; y: number };
export type ScreenColumns = {
  cols: { x: number; y: number; w: number; h: number; zero: boolean }[];   // screen px, y = top
  base: number;                 // screen y of the floor
  ribbon: string;               // the ribbon path (screen px)
  /** Position + direction at a fraction of the ribbon's length (what
   *  pathLength dash offsets and offset-distance both measure). */
  pointAt: (f: number) => Pt & { angle: number };
  top: number;                  // highest column top (screen y)
};

export function screenColumns(daily: number[], previousIncome: number | null | undefined, kx: number, ky: number, oy: number): ScreenColumns {
  const { cols } = buildColumns(daily, previousIncome);
  const X = (x: number) => x * kx, Y = (y: number) => oy + y * ky;
  const sc = cols.map((c) => ({ x: X(c.x), y: Y(BASE - c.h), w: c.w * kx, h: c.h * ky, zero: c.zero }));

  // Ribbon, 22 px above the tops, bleeding past both edges. Weekly: through
  // every column top (the prototype). Monthly (> 10 columns): through a
  // smoothed envelope of the tops (a ±2-day max, then a 5-tap average) — a
  // ribbon through 30 alternating tops and stubs would zig-zag.
  let tops = cols.map((c) => c.h);
  if (cols.length > 10) {
    const env = tops.map((_, i) => Math.max(...tops.slice(Math.max(0, i - 2), i + 3)));
    const K = [0.1, 0.2, 0.4, 0.2, 0.1];
    tops = env.map((_, i) => K.reduce((a, w, j) => a + w * env[Math.min(env.length - 1, Math.max(0, i + j - 2))], 0));
  }
  const tip = (i: number) => BASE - tops[i] - RIBBON_LIFT;
  const pts: Pt[] = [
    { x: -30, y: tip(0) },
    ...cols.map((c, i) => ({ x: c.x + c.w / 2, y: tip(i) })),
    { x: CANVAS_W + 30, y: tip(cols.length - 1) },
  ].map((p) => ({ x: X(p.x), y: Y(p.y) }));
  let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  const poly: Pt[] = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${c1.x.toFixed(1)} ${c1.y.toFixed(1)} ${c2.x.toFixed(1)} ${c2.y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    for (let s = 1; s <= 16; s++) {         // sampled for pointAt (length-proportional)
      const u = s / 16, v = 1 - u;
      poly.push({
        x: v * v * v * p1.x + 3 * v * v * u * c1.x + 3 * v * u * u * c2.x + u * u * u * p2.x,
        y: v * v * v * p1.y + 3 * v * v * u * c1.y + 3 * v * u * u * c2.y + u * u * u * p2.y,
      });
    }
  }
  const cum = [0];
  for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y));
  const total = cum[cum.length - 1];
  const pointAt = (f: number) => {
    const len = Math.max(0, Math.min(total, f * total));
    let i = 1;
    while (i < cum.length - 1 && cum[i] < len) i++;
    const k = (len - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1), a = poly[i - 1], b = poly[i];
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, angle: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI };
  };
  return { cols: sc, base: Y(BASE), ribbon: d, pointAt, top: Math.min(...sc.map((c) => c.y)) };
}

export const payloadColumns = (p: Pick<RecapPayload, 'daily' | 'previous'>, kx = 1, ky = 1, oy = 0) =>
  screenColumns(p.daily, p.previous?.income ?? null, kx, ky, oy);
