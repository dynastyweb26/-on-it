// ═══ chart.breakdown · top six plus Other ═══
//
// RULES.md §2: horizontal bars, top 6 plus Other, Other always last. Shares are
// whole percentages that sum to 100 — computed with the largest-remainder
// method so six 16.6% slices do not total 96.
//
// Display amounts arrive as finished server strings (RULES §5) and are passed
// through untouched; `value` is the numeric figure used only to rank and sum.
// This module never formats money.
import type { BreakdownProps } from './props';

export const BREAKDOWN_TOP = 6;

export type BreakdownSourceRow = {
  name: string;
  /** The finished money string the card prints. */
  amount: string;
  /** The same figure as a number, for ranking and shares only. */
  value: number;
  other?: boolean;
};

export type BreakdownSource = {
  eyebrow: string;
  tone: 'in' | 'out';
  /** The finished total string the card prints after its sign. */
  total: string;
  rows: readonly BreakdownSourceRow[];
  /**
   * The finished display string for the folded Other bucket, required when rows
   * beyond the top six are folded and no row was already marked `other`. The
   * server composes it; this module never sums money into a display string.
   */
  otherAmount?: string;
};

/**
 * Whole percentages that sum to exactly 100, or all zeros when every value is
 * zero. Ties in the remainder go to the earlier row, so the result is stable.
 */
export function sharesSummingTo100(values: readonly number[]): number[] {
  const safe = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const total = safe.reduce((a, b) => a + b, 0);
  if (total === 0) return safe.map(() => 0);

  const exact = safe.map((v) => (v / total) * 100);
  const floors = exact.map((v) => Math.floor(v));
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((v, i) => ({ i, rest: v - Math.floor(v) }))
    .sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  return floors;
}

export type BreakdownView = {
  props: BreakdownProps;
  /** True when rows were folded into an Other bucket. */
  hasOther: boolean;
};

/**
 * Shape one breakdown: rank by value, keep six, fold everything else (including
 * any rows already marked `other`) into a final Other row, then make the shares
 * whole and summing to 100. Never more than seven rows, Other always last.
 */
export function breakdownView(source: BreakdownSource): BreakdownView {
  const named = source.rows.filter((r) => !r.other);
  const preOther = source.rows.filter((r) => r.other);

  const ranked = [...named].sort((a, b) => b.value - a.value);
  const top = ranked.slice(0, BREAKDOWN_TOP);
  const rest = ranked.slice(BREAKDOWN_TOP);

  const otherRows = [...preOther, ...rest];
  const otherValue = otherRows.reduce((sum, r) => sum + (Number.isFinite(r.value) ? r.value : 0), 0);
  const hasOther = otherRows.length > 0;
  const otherAmount = preOther[0]?.amount ?? source.otherAmount;
  if (hasOther && !otherAmount) {
    throw new Error('chart.breakdown folding rows needs a finished Other amount');
  }

  const rows = hasOther
    ? [...top, { name: 'Other', amount: otherAmount as string, value: otherValue, other: true }]
    : top;

  if (rows.length === 0) {
    return {
      props: { state: 'empty', tone: source.tone, eyebrow: source.eyebrow, total: source.total, rows: [] },
      hasOther: false,
    };
  }

  const shares = sharesSummingTo100(rows.map((r) => r.value));
  return {
    props: {
      state: 'filled',
      tone: source.tone,
      eyebrow: source.eyebrow,
      total: source.total,
      rows: rows.map((r, i) => ({
        name: r.name,
        amount: r.amount,
        share: shares[i],
        ...(r.other ? { other: true } : {}),
      })),
    },
    hasOther,
  };
}
