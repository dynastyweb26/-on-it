// ═══ chart.trend · shaping, the one-point fallback and the readout ═══
//
// RULES.md §2 and §5: a trend needs 2 to 12 points; at one point it falls back
// to stat.tiles (a real template, not a stand-in); at zero it is the empty
// state. Money arrives as server numbers, so this module is the one place
// allowed to FORMAT it — the readout for the selected point uses the design's
// own rule (dollar sign, two decimals, '+' in / U+2212 out).
import type { StatTilesProps, TrendChartProps, TrendPoint } from './props';
import { resolveTemplate } from '@/lib/tools/templates';

export const TREND_MIN_POINTS = 2;
export const TREND_MAX_POINTS = 12;

const MINUS = '\u2212'; // U+2212, the sign the design uses for money out

/** The design's fmt: `$1,234.50`; with a sign, `+` in / U+2212 out. */
export function fmtMoney(value: number, sign = false): string {
  const abs = Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return sign ? `${value < 0 ? MINUS : '+'}$${abs}` : `$${abs}`;
}

export type TrendReadout = {
  full: string;
  inc: string;
  out: string;
  kept: string;
  keptNegative: boolean;
};

/** The readout for the selected point; the only money the card formats. */
export function trendReadout(point: TrendPoint): TrendReadout {
  const kept = point.inc - point.out;
  return {
    full: point.full ?? point.label,
    inc: fmtMoney(point.inc, true),
    out: MINUS + fmtMoney(point.out),
    kept: fmtMoney(kept, true),
    keptNegative: kept < 0,
  };
}

export type OverSpend = { labels: string[]; text: string };

/** Periods whose out exceeded inc, named as the design names them. */
export function overSpentPeriods(points: readonly TrendPoint[]): OverSpend {
  const over = points.filter((p) => p.out > p.inc);
  const text =
    over.length === 0
      ? ''
      : over.length === 1
        ? `Spent more than you brought in during ${over[0].full ?? over[0].label}.`
        : `Spent more than you brought in during ${over.length} periods.`;
  return { labels: over.map((p) => p.full ?? p.label), text };
}

export type TrendView =
  | { kind: 'empty'; template: 'chart.trend'; points: []; state: 'empty' }
  | {
      kind: 'fallback';
      template: 'stat.tiles';
      /** The id resolveTemplate would pick at one point. */
      resolved: 'stat.tiles';
      tiles: StatTilesProps['tiles'];
    }
  | {
      kind: 'chart';
      template: 'chart.trend';
      points: TrendPoint[];
      over: OverSpend;
      readout: TrendReadout;
    };

/**
 * Shape the points. More than twelve keeps the newest twelve (a chart of the
 * last year is the last twelve months, not the first); fewer than two follows
 * the design's own fallback and empty states.
 */
export function trendView(raw: readonly TrendPoint[]): TrendView {
  const points = raw.slice(-TREND_MAX_POINTS);

  if (points.length === 0) return { kind: 'empty', template: 'chart.trend', points: [], state: 'empty' };

  if (points.length === 1) {
    const only = points[0];
    return {
      kind: 'fallback',
      template: resolveTemplate('chart.trend', 1) as 'stat.tiles',
      resolved: 'stat.tiles',
      tiles: [
        {
          label: 'Collected',
          value: fmtMoney(only.inc, true),
          tone: 'in',
          period: only.full ?? only.label,
        },
        {
          label: 'Spent',
          value: MINUS + fmtMoney(only.out),
          tone: 'out',
          period: only.full ?? only.label,
        },
      ],
    };
  }

  return {
    kind: 'chart',
    template: 'chart.trend',
    points,
    over: overSpentPeriods(points),
    readout: trendReadout(points[points.length - 1]),
  };
}

/** The selected point, clamped the way the design clamps its selection. */
export function selectedPoint(points: readonly TrendPoint[], index: number | null): TrendPoint | null {
  if (points.length === 0) return null;
  const i = Math.min(Math.max(index ?? points.length - 1, 0), points.length - 1);
  return points[i] ?? null;
}

/** Props for the chart card, ready for the props schema. */
export function trendChartProps(
  base: { eyebrow: string; title: string },
  points: readonly TrendPoint[],
): TrendChartProps {
  return {
    state: points.length === 0 ? 'empty' : 'filled',
    eyebrow: base.eyebrow,
    title: base.title,
    points: points.slice(-TREND_MAX_POINTS),
  };
}
