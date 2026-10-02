// The opener's columns + ribbon (RECAP-SPEC §5 "opener", decision 6): the
// prototype's columns opener (slides.js) with the On It build's rules:
//   weekly  = 7 day columns;
//   monthly = 4–6 calendar-week columns (Mon–Sun weeks clipped to the month),
//             derived at render time from the stored daily series — nothing
//             extra is stored, and the weeks can't disagree with the days.
// Heights are scaled against the previous period (a quiet period stands lower
// than a busy one); zero columns stay as small stubs (never invisible); no
// value label, no day/week-label axis. Pure geometry; the slide draws it.
//
// Authored on the prototype's 393 × 852 canvas, then mapped to the screen:
// x × kx, y → oy + y × ky. The ribbon is a Catmull-Rom → cubic Bézier through
// the column tops (exactly the prototype's); an affine map of its control
// points maps the curve exactly, so it's built straight in screen px.
import { addDays, daysBetween, previousPeriod } from '@/lib/recap/dates';
import type { RecapPayload } from '@/lib/recap/payload';

export const CANVAS_W = 393;
export const CANVAS_H = 852;
export const BASE = 748;          // column floor (prototype)
export const MAXH = 210;          // tallest column at full height
const L0 = 28, SPAN_W = 337;      // the row of columns: x 28 → 365
const DAY_COL = 30;               // prototype: one column per day
const WEEK_COL = 52;              // prototype: one column per week
const MIN_H = 14;                 // the smallest real column
export const STUB_H = 6;          // a zero column: a low stub, never invisible
const RIBBON_LIFT = 22;           // ribbon rides 22 px above the column tops
const NO_REF_AMP = 0.75;
/** The highest anything reaches (a full column + ribbon + its glow): the
 *  fitting reference, the same for every period so heights stay comparable. */
export const CEILING = BASE - MAXH - RIBBON_LIFT - 10;

const weekday = (ymd: string) => (new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7; // Mon = 0 … Sun = 6

/** Mon–Sun calendar weeks clipped to [start, end]: each bucket's first day,
 *  last day, and total from `daily` (one value per day from `start`). */
export function calendarWeeks(start: string, end: string, daily: number[] = []) {
  const weeks: { start: string; end: string; amount: number }[] = [];
  const days = daysBetween(start, end) + 1;
  let i = 0;
  while (i < days) {
    const len = Math.min(7 - weekday(addDays(start, i)), days - i);   // to the next Sunday, or the month's end
    weeks.push({ start: addDays(start, i), end: addDays(start, i + len - 1), amount: daily.slice(i, i + len).reduce((a, b) => a + b, 0) });
    i += len;
  }
  return weeks;
}

export type OpenerSeries = { values: number[]; ref: number | null; wide: boolean };

/** What the columns show: weekly → the 7 days; monthly → calendar-week
 *  totals. `ref` = the previous period's income per column (previous week ÷
 *  7; previous month ÷ ITS number of calendar weeks); null if unknown. */
export function openerSeries(p: Pick<RecapPayload, 'kind' | 'start' | 'end' | 'daily' | 'previous'>): OpenerSeries {
  const prev = p.previous?.income && p.previous.income > 0 ? p.previous.income : null;
  if (p.kind !== 'month') return { values: p.daily, ref: prev && prev / Math.max(1, p.daily.length), wide: false };
  const pp = previousPeriod({ kind: 'month', start: p.start, end: p.end });
  return {
    values: calendarWeeks(p.start, p.end, p.daily).map((w) => w.amount),
    ref: prev && prev / calendarWeeks(pp.start, pp.end).length,
    wide: true,
  };
}

/** amp = 0.4 + 0.6 × min(1, average column / ref); no ref → 0.75. */
export function columnsAmp(values: number[], ref: number | null): number {
  if (!ref) return NO_REF_AMP;
  const avg = values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
  return 0.4 + 0.6 * Math.min(1, avg / ref);
}

export type Col = { x: number; w: number; h: number; zero: boolean };   // canvas px; top = BASE − h

export function buildColumns({ values, ref, wide }: OpenerSeries): { cols: Col[]; amp: number } {
  const n = Math.max(1, values.length);
  const mx = Math.max(0, ...values);
  const amp = mx > 0 ? columnsAmp(values, ref) : 0;
  const w = wide ? WEEK_COL : DAY_COL;
  const gap = n > 1 ? (SPAN_W - n * w) / (n - 1) : 0;
  const cols = values.map((v, i) => {
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

export function screenColumns(series: OpenerSeries, kx: number, ky: number, oy: number): ScreenColumns {
  const { cols } = buildColumns(series);
  const X = (x: number) => x * kx, Y = (y: number) => oy + y * ky;
  const sc = cols.map((c) => ({ x: X(c.x), y: Y(BASE - c.h), w: c.w * kx, h: c.h * ky, zero: c.zero }));

  // Ribbon: through every column top + 22 px, bleeding past both edges (prototype).
  const tip = (c: Col) => BASE - c.h - RIBBON_LIFT;
  const pts: Pt[] = [
    { x: -30, y: tip(cols[0]) },
    ...cols.map((c) => ({ x: c.x + c.w / 2, y: tip(c) })),
    { x: CANVAS_W + 30, y: tip(cols[cols.length - 1]) },
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

export const payloadColumns = (p: Parameters<typeof openerSeries>[0], kx = 1, ky = 1, oy = 0) =>
  screenColumns(openerSeries(p), kx, ky, oy);
