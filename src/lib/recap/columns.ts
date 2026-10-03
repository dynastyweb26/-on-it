// The opener's columns + ribbon (RECAP-SPEC §5 "opener", decision 6): the
// prototype's columns opener (slides.js) with the On It build's rules:
//   weekly  = 7 day columns;
//   monthly = 4–5 calendar-week columns (Mon–Sun weeks clipped to the month,
//             a first/last week of ≤ 3 days merged into its neighbour),
//             derived at render time from the stored daily series — nothing
//             extra is stored, and the weeks can't disagree with the days.
// Heights are scaled against the previous period (a quiet period stands lower
// than a busy one); zero columns stay as small stubs (never invisible). Axis
// labels under every column (weekly: the date, 22 … 28; monthly: each week's
// start, "Sep 1", "Sep 8" …) and the tallest column's amount above it (the
// prototype's rc-day / rc-peak, restored 2026-10-03). Pure geometry; the slide
// draws it.
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
export const PEAK_LIFT = 44;      // prototype rc-peak: its top sits 44 px above the column top
export const LABEL_Y = 796;       // prototype rc-day: top of the axis labels (floor + 48)
/** The highest anything reaches (the peak amount over a full column): the
 *  fitting reference, the same for every period so heights stay comparable. */
export const CEILING = BASE - MAXH - PEAK_LIFT - 4;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const weekday = (ymd: string) => (new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7; // Mon = 0 … Sun = 6

/** Mon–Sun calendar weeks clipped to [start, end]: each bucket's first day,
 *  last day, length in days and total from `daily` (one value per day from
 *  `start`). */
export function calendarWeeks(start: string, end: string, daily: number[] = []) {
  const weeks: { start: string; end: string; days: number; amount: number }[] = [];
  const total = daysBetween(start, end) + 1;
  let i = 0;
  while (i < total) {
    const len = Math.min(7 - weekday(addDays(start, i)), total - i);   // to the next Sunday, or the month's end
    weeks.push({ start: addDays(start, i), end: addDays(start, i + len - 1), days: len, amount: daily.slice(i, i + len).reduce((a, b) => a + b, 0) });
    i += len;
  }
  return weeks;
}

const SHORT_EDGE = 3;   // an edge week of ≤ 3 days merges into its neighbour

/** The monthly opener's columns: calendar weeks, with a first or last week of
 *  ≤ 3 days merged into the adjacent week (Sep 28–30 + 21–27 → 21–30). Any
 *  28–31-day month gives 4 or 5 columns, never 6, and no misleadingly short
 *  edge column. */
export function monthColumns(start: string, end: string, daily: number[] = []) {
  const w = calendarWeeks(start, end, daily);
  const merge = (a: (typeof w)[number], b: (typeof w)[number]) =>
    ({ start: a.start, end: b.end, days: a.days + b.days, amount: a.amount + b.amount });
  if (w.length > 1 && w[0].days <= SHORT_EDGE) w.splice(0, 2, merge(w[0], w[1]));
  if (w.length > 1 && w[w.length - 1].days <= SHORT_EDGE) w.splice(w.length - 2, 2, merge(w[w.length - 2], w[w.length - 1]));
  return w;
}

/** A column's height value: its total, except a merged column longer than a
 *  week counts at its 7-day rate (total × 7 / days), so 10 days of income
 *  don't stand taller than a week's worth. Shorter (unmerged 4–6-day) edge
 *  weeks keep their real total — scaling them UP would turn one payment into
 *  a giant bar. */
const weekValue = (c: { days: number; amount: number }) => (c.days > 7 ? (c.amount * 7) / c.days : c.amount);

/** values = what sets each column's height; amounts = its real total (the
 *  peak label); labels = the axis text under it. */
export type OpenerSeries = { values: number[]; ref: number | null; wide: boolean; amounts: number[]; labels: string[] };

/** What the columns show: weekly → the 7 days; monthly → the month's
 *  columns (monthColumns, merged-week values at a 7-day rate). `ref` = the
 *  previous period's income per column (previous week ÷ 7; previous month ÷
 *  ITS number of columns, same merge rule); null if unknown. */
export function openerSeries(p: Pick<RecapPayload, 'kind' | 'start' | 'end' | 'daily' | 'previous'>): OpenerSeries {
  const prev = p.previous?.income && p.previous.income > 0 ? p.previous.income : null;
  if (p.kind !== 'month') {
    return {
      values: p.daily, ref: prev && prev / Math.max(1, p.daily.length), wide: false,
      amounts: p.daily, labels: p.daily.map((_, i) => String(Number(addDays(p.start, i).slice(8, 10)))),
    };
  }
  const pp = previousPeriod({ kind: 'month', start: p.start, end: p.end });
  const weeks = monthColumns(p.start, p.end, p.daily);
  return {
    values: weeks.map(weekValue),
    ref: prev && prev / monthColumns(pp.start, pp.end).length,
    wide: true,
    amounts: weeks.map((w) => w.amount),
    labels: weeks.map((w) => `${MON[Number(w.start.slice(5, 7)) - 1]} ${Number(w.start.slice(8, 10))}`),
  };
}

/** amp = 0.4 + 0.6 × min(1, average column / ref); no ref → 0.75. */
export function columnsAmp(values: number[], ref: number | null): number {
  if (!ref) return NO_REF_AMP;
  const avg = values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
  return 0.4 + 0.6 * Math.min(1, avg / ref);
}

/** The tallest column (first on a tie), or −1 when every column is $0. */
export function peakIndex(values: number[]): number {
  const mx = Math.max(0, ...values);
  return mx > 0 ? values.indexOf(mx) : -1;
}

export type Col = { x: number; w: number; h: number; zero: boolean };   // canvas px; top = BASE − h

export function buildColumns({ values, ref, wide }: Pick<OpenerSeries, 'values' | 'ref' | 'wide'>): { cols: Col[]; amp: number } {
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
  labelY: number;               // screen y (top) of the axis labels
  /** The tallest column's index, amount and label top (screen y); null when all are $0. */
  peak: { i: number; amount: number; y: number } | null;
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
  const pi = peakIndex(series.values);
  return {
    cols: sc, base: Y(BASE), ribbon: d, pointAt, top: Math.min(...sc.map((c) => c.y)),
    labelY: Y(LABEL_Y),
    peak: pi < 0 ? null : { i: pi, amount: series.amounts[pi] ?? 0, y: Y(BASE - cols[pi].h - PEAK_LIFT) },
  };
}

export const payloadColumns = (p: Parameters<typeof openerSeries>[0], kx = 1, ky = 1, oy = 0) =>
  screenColumns(openerSeries(p), kx, ky, oy);
