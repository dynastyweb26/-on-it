// ═══ Books chart — the data the mountain is drawn from ═══
// One place that turns confirmed ledger rows into weekly or monthly points:
// money in (invoice_payments + other income), money out (expenses), and Kept
// (in − out). Unreviewed bank items are never inputs here: they are not
// confirmed records, and a chart that counted them would invent money.
//
// A refund row is a ledger row with a negative amount, so Collected nets it
// instead of ignoring it — the chart and the Collected tile read the same rows.
import { countsAsIncome } from './other-income';

export type ChartGrain = 'week' | 'month' | 'year';

export type ChartPoint = {
  key: string;
  label: string;
  collectedCents: number;
  spentCents: number;
  keptCents: number;
};

export type ChartPayment = { amount: string | number | null; paid_at: string | null };
export type ChartOtherIncome = {
  amount: string | number | null;
  received_on: string | null;
  classification?: string | null;
  deleted_at?: string | null;
};
export type ChartSpend = { amount: string | number | null; spent_on: string | null };

const cents = (value: string | number | null | undefined): number => {
  if (value === null || value === undefined) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

const dayOf = (value: string | null | undefined): string =>
  typeof value === 'string' && value.length >= 10 ? value.slice(0, 10) : '';

/** yyyy-mm-dd → the bucket key and its label for the grain. */
export function bucketOf(day: string, grain: ChartGrain): { key: string; label: string } {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  if (grain === 'year') {
    return { key: day.slice(0, 4), label: day.slice(0, 4) };
  }
  if (grain === 'month') {
    return {
      key: day.slice(0, 7),
      label: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
    };
  }
  // Weeks stay inside their month, exactly as the Expenses list groups them.
  const block = Math.floor((date.getDate() - 1) / 7);
  const start = block * 7 + 1;
  const end = Math.min(block * 7 + 7, new Date(y, m ?? 1, 0).getDate());
  return {
    key: `${day.slice(0, 7)}-w${block}`,
    label: `${date.toLocaleDateString('en-US', { month: 'short' })} ${start}–${end}`,
  };
}

/**
 * Weekly or monthly points, oldest first, with months between the first and
 * last record kept as zero rows (a gap in the chart is information).
 */
export function chartPoints(
  payments: readonly ChartPayment[] | null | undefined,
  other: readonly ChartOtherIncome[] | null | undefined,
  spent: readonly ChartSpend[] | null | undefined,
  grain: ChartGrain,
): ChartPoint[] {
  const buckets = new Map<string, ChartPoint>();
  const touch = (day: string) => {
    if (!day) return null;
    const { key, label } = bucketOf(day, grain);
    let point = buckets.get(key);
    if (!point) {
      point = { key, label, collectedCents: 0, spentCents: 0, keptCents: 0 };
      buckets.set(key, point);
    }
    return point;
  };

  for (const row of payments ?? []) {
    const point = touch(dayOf(row.paid_at));
    // A reversal is stored negative, so this nets it.
    if (point) point.collectedCents += cents(row.amount);
  }
  for (const row of other ?? []) {
    if (row.deleted_at || !countsAsIncome(row.classification)) continue;
    const point = touch(dayOf(row.received_on));
    if (point) point.collectedCents += cents(row.amount);
  }
  for (const row of spent ?? []) {
    const point = touch(dayOf(row.spent_on));
    if (point) point.spentCents += cents(row.amount);
  }

  return [...buckets.values()]
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map((point) => ({ ...point, keptCents: point.collectedCents - point.spentCents }));
}

// ── Geometry (CHANGES.md · C) ──────────────────────────────────────────────

/** The data is inset ~3% from both edges: the ends never stand on the axis. */
export const CHART_INSET = 0.03;

export function plotX(index: number, count: number, width: number, inset = CHART_INSET): number {
  if (!Number.isFinite(width) || width <= 0) return 0;
  if (count <= 1) return width / 2;
  const clamped = Math.min(count - 1, Math.max(0, index));
  const left = width * inset;
  const right = width * (1 - inset);
  return left + (right - left) * (clamped / (count - 1));
}

/**
 * The first and last points ease toward their neighbour instead of starting on
 * a cliff: a 15% pull, so the ridge still reads the value but arrives softly.
 */
export function easeEnds(values: readonly number[], pull = 0.15): number[] {
  if (values.length < 3) return [...values];
  const out = [...values];
  out[0] = values[0] + (values[1] - values[0]) * pull;
  const last = values.length - 1;
  out[last] = values[last] + (values[last - 1] - values[last]) * pull;
  return out;
}

/**
 * A peak label that would collide with the y-axis is shifted right rather than
 * dropped or overlapped. Returns the label's centre.
 */
export function peakLabelX(centre: number, halfWidth: number, axisWidth: number): number {
  if (centre - halfWidth < axisWidth) return axisWidth + halfWidth;
  return centre;
}

/** The chart's y-axis top: a round number at or above the largest value. */
export function chartTop(values: readonly number[]): number {
  const max = values.reduce((top, value) => Math.max(top, value), 0);
  if (max <= 0) return 0;
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  return Math.ceil(max / (step / 2)) * (step / 2);
}

// ── The shell: which period, and at what grain ────────────────────────────

export type ChartPreset = 'all' | 'last3m' | 'this_month';

export const CHART_PRESETS: readonly { value: ChartPreset; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'last3m', label: 'Last 3 months' },
  { value: 'this_month', label: 'This month' },
];

/** All time reads by month or year; a short range by week or month. */
export function grainOptions(preset: ChartPreset): ChartGrain[] {
  return preset === 'all' ? ['month', 'year'] : ['week', 'month'];
}

/** Never show a toggle with nothing selected: an unoffered pick becomes Months. */
export function resolveGrain(preset: ChartPreset, wanted: ChartGrain): ChartGrain {
  return grainOptions(preset).includes(wanted) ? wanted : 'month';
}

/** The first day a preset's chart covers, as yyyy-mm-dd, from a real today. */
export function presetStart(preset: ChartPreset, today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  if (preset === 'all') return '';
  if (preset === 'this_month') return `${today.slice(0, 7)}-01`;
  const start = new Date(y, m - 1 - 2, 1);
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`;
}
