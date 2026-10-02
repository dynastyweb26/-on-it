// The opener's income horizon (RECAP-SPEC §5 "opener — HORIZON LINE"): the
// prototype's shapes.horizon (util.js) plus the On It build's rules for the
// height reference, a $0 period and the second haze. Pure geometry on the
// 393 × 852 design canvas; the slide draws it.
import type { RecapPayload } from '@/lib/recap/payload';

export const CANVAS_W = 393;
export const CANVAS_H = 852;
export const BASE = 790;
const RISE = 178;          // TOP = BASE − RISE × amp
const NO_REF_AMP = 0.75;   // no previous income to compare with
const ZERO_LIFT = 12;      // $0 period: the line sits 12 px above BASE …
const ZERO_SWELL = 6;      // … with one long ≤ 6 px swell

export type Pt = { x: number; y: number };
export type Horizon = {
  d: string;          // the line
  area: string;       // the line closed down to y 852
  top: number;
  amp: number;
  zero: boolean;      // a $0 period: calm swell, fill at half strength
  vertices: number;
  points: Pt[];       // the sampled curve (canvas px)
  peak: Pt;
  /** A second, smaller haze: over the second-highest hill when it is ≥ 70 %
   *  of the peak's height and ≥ 90 px away; else null. */
  second: Pt | null;
  /** Position + direction at a fraction of the line's LENGTH (what both
   *  stroke-dashoffset with pathLength and offset-distance measure). */
  pointAt: (f: number) => Pt & { angle: number };
};

/** amp = 0.4 + 0.6 × min(1, avg / ref), ref = the previous period's average
 *  daily income; no previous income → 0.75. */
export function horizonAmp(daily: number[], previousIncome: number | null | undefined): number {
  const n = daily.length || 1;
  const avg = daily.reduce((a, b) => a + b, 0) / n;
  const ref = previousIncome && previousIncome > 0 ? previousIncome / n : 0;
  if (!ref) return NO_REF_AMP;
  return 0.4 + 0.6 * Math.min(1, avg / ref);
}

export function buildHorizon(daily: number[], previousIncome: number | null | undefined): Horizon {
  const n = Math.max(2, daily.length);
  const series = daily.length >= 2 ? daily : [daily[0] ?? 0, daily[0] ?? 0];
  const mx = Math.max(0, ...series);
  const zero = mx <= 0;
  const amp = zero ? 0 : horizonAmp(series, previousIncome);
  const top = BASE - RISE * amp;
  const dx = (CANVAS_W + 20) / (n - 1);

  let pts: Pt[];
  if (zero) {
    pts = series.map((_, i) => {
      const x = -10 + i * dx;
      return { x, y: BASE - ZERO_LIFT - ZERO_SWELL * Math.sin(Math.PI * (x + 10) / (CANVAS_W + 20)) };
    });
  } else {
    // (x / max)^0.7 lifts small days; then smooth: 3-tap ≤ 10 points, 7-tap above.
    let v = series.map((x) => Math.pow(Math.max(0, x) / mx, 0.7));
    const ker = n > 10 ? [0.05, 0.12, 0.2, 0.26, 0.2, 0.12, 0.05] : [0.15, 0.7, 0.15];
    const hk = (ker.length - 1) / 2;
    v = v.map((_, i) => ker.reduce((a, w, j) => a + w * v[Math.min(n - 1, Math.max(0, i + j - hk))], 0));
    const vmax = Math.max(1e-6, ...v);
    pts = v.map((y, i) => ({ x: -10 + i * dx, y: BASE - (0.06 + 0.94 * y / vmax) * (BASE - top) }));
  }

  // Catmull-Rom through the points: 20 steps per segment weekly, 8 monthly.
  const poly: Pt[] = [];
  const steps = n > 10 ? 8 : 20;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 0; s < steps; s++) {
      const u = s / steps, u2 = u * u, u3 = u2 * u;
      poly.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * u + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3),
        y: Math.min(BASE + 4, 0.5 * (2 * p1.y + (-p0.y + p2.y) * u + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3)),
      });
    }
  }
  poly.push(pts[pts.length - 1]);

  const { d, area, pointAt } = trace(poly, CANVAS_H);
  const peak = poly.reduce((a, p) => (p.y < a.y ? p : a), poly[0]);

  // Hills = local highs of the sampled curve (on screen, x 0 … 393).
  let second: Pt | null = null;
  if (!zero) {
    const h = (p: Pt) => BASE - p.y;
    const hills = poly.filter((p, i) => i > 0 && i < poly.length - 1 && p.x >= 0 && p.x <= CANVAS_W
      && p.y <= poly[i - 1].y && p.y < poly[i + 1].y);
    second = hills
      .filter((p) => Math.abs(p.x - peak.x) >= 90 && h(p) >= 0.7 * h(peak))
      .reduce<Pt | null>((a, p) => (!a || p.y < a.y ? p : a), null);
  }

  return { d, area, top, amp, zero, vertices: poly.length, points: poly, peak, second, pointAt };
}

/** Line path, area path (closed down to `floor`) and a by-length sampler for a polyline. */
function trace(poly: Pt[], floor: number) {
  const cum = [0];
  for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y));
  const total = cum[cum.length - 1];
  const d = 'M' + poly.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L');
  const area = `${d} L${poly[poly.length - 1].x.toFixed(1)} ${floor.toFixed(1)} L${poly[0].x.toFixed(1)} ${floor.toFixed(1)} Z`;
  const pointAt = (f: number) => {
    const len = Math.max(0, Math.min(total, f * total));
    let i = 1;
    while (i < cum.length - 1 && cum[i] < len) i++;
    const k = (len - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1), a = poly[i - 1], b = poly[i];
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, angle: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI };
  };
  return { d, area, pointAt };
}

/** Highest point the horizon can reach (amp 1), less the glow stroke: the
 *  fitting reference, the same for every period so heights stay comparable. */
export const HORIZON_CEILING = BASE - RISE - 8;

export type ScreenHorizon = Pick<Horizon, 'd' | 'area' | 'pointAt' | 'zero'> & { peak: Pt; second: Pt | null; top: number };

/** The horizon in screen px: x × kx, y → oy + y × ky (the canvas's bottom on
 *  the screen's bottom). ky < kx squashes it vertically on short screens;
 *  mapping the points (not scaling the SVG) keeps strokes and the rider round. */
export function screenHorizon(h: Horizon, kx: number, ky: number, oy: number, floor: number): ScreenHorizon {
  const m = (p: Pt): Pt => ({ x: p.x * kx, y: oy + p.y * ky });
  const t = trace(h.points.map(m), floor);
  return { ...t, zero: h.zero, peak: m(h.peak), second: h.second ? m(h.second) : null, top: oy + h.top * ky };
}

export const payloadHorizon = (p: Pick<RecapPayload, 'daily' | 'previous'>) => buildHorizon(p.daily, p.previous?.income ?? null);
