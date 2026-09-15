// ═══ Date dividers — group a transaction list into calendar buckets ═══
// Shared by the Books expense list (week granularity, with subtotals) and the
// Invoices list (month granularity, no subtotal).
//
// Weeks start Monday and are CLAMPED to a single month: a week that crosses a
// month boundary splits into two groups (e.g. a Mon Aug 31 – Sun Sep 6 week
// becomes "Aug 31" and "Sep 1-6"). Without the clamp a pill would sit under the
// wrong month and weekly subtotals would stop rolling up to the monthly total
// the summary page shows.

export type DividerGranularity = 'week' | 'month' | 'year';

export interface DateGroup<T> {
  key: string;      // stable, unique per bucket
  label: string;    // "Aug 1-7", "August 2026", "2026"
  subtotal: number; // sum of amountOf across the group's items
  items: T[];
}

const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const MON = MONTHS.map((m) => m.slice(0, 3));

/** Monday (0) … Sunday (6) for a local date. */
function mondayIndex(y: number, m: number, d: number): number {
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

/** The {key, label} of the bucket a yyyy-mm-dd falls in. For a week, the bucket
 *  is the intersection of its Monday-start week with the date's own month, so a
 *  cross-month week yields two distinct buckets. */
function bucketOf(iso: string, g: DividerGranularity): { key: string; label: string } {
  const [y, m, d] = iso.split('-').map(Number);
  if (g === 'year') return { key: `${y}`, label: `${y}` };
  if (g === 'month') return { key: `${y}-${pad(m)}`, label: `${MONTHS[m - 1]} ${y}` };
  // week — clamp the Monday-start week to this date's month
  const idx = mondayIndex(y, m, d);
  const lastOfMonth = new Date(y, m, 0).getDate();
  const segStart = Math.max(d - idx, 1);            // week's Monday, but not before day 1
  const segEnd = Math.min(d + (6 - idx), lastOfMonth); // week's Sunday, but not past month end
  const label = segStart === segEnd
    ? `${MON[m - 1]} ${segStart}`
    : `${MON[m - 1]} ${segStart}-${segEnd}`;
  return { key: `${y}-${pad(m)}-${pad(segStart)}`, label };
}

/** Group items into ordered calendar buckets, preserving the input order (so a
 *  newest-first list yields newest-first groups with newest-first rows). */
export function groupByPeriod<T>(
  items: T[],
  dateOf: (t: T) => string | null | undefined,
  amountOf: (t: T) => number,
  granularity: DividerGranularity,
): DateGroup<T>[] {
  const map = new Map<string, DateGroup<T>>();
  for (const it of items) {
    const iso = dateOf(it);
    if (!iso) continue;
    const { key, label } = bucketOf(iso, granularity);
    let g = map.get(key);
    if (!g) { g = { key, label, subtotal: 0, items: [] }; map.set(key, g); }
    g.items.push(it);
    g.subtotal += amountOf(it);
  }
  return [...map.values()];
}
