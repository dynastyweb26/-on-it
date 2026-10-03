// Expense categories on the recap (RECAP-SPEC §0b "top 4 + other (data-1..5)",
// §5 moneyOut / keptInvest): labels from the app's expense categories, and a
// colour by RANK — the payload keeps the 4 largest categories plus "other",
// so the largest is always data-1 (gold) and "other" always data-5.
import { CATEGORY_LABEL, isExpenseCategory } from '@/lib/expenses';
import type { RecapPayload } from '@/lib/recap/payload';

export const DATA_COLORS = ['#d4af37', '#2f8a83', '#c0693f', '#5b77a8', '#6f8c5c'] as const; // --onit-data-1..5
export const OTHER_COLOR = DATA_COLORS[4];

export const categoryLabel = (key: string) => (isExpenseCategory(key) ? CATEGORY_LABEL[key] : 'Other');

/** key → colour for this recap's categories (rank order; "other" = data-5). */
export function categoryColors(p: Pick<RecapPayload, 'spend'>): (key: string) => string {
  const map = new Map<string, string>();
  let i = 0;
  for (const c of p.spend.categories) map.set(c.key, c.key === 'other' ? OTHER_COLOR : DATA_COLORS[Math.min(3, i++)]);
  return (key) => map.get(key) ?? OTHER_COLOR;   // a receipt outside the top 4 is "other"
}

/** The prototype's ringSegments: each category's share of the ring
 *  (pathLength 100), in order, with a 1.2 gap between segments. `start`/`len`
 *  also drive the draw timing (each segment's slice of the ring beat). */
export function ringSegments(amounts: number[], gap = 1.2) {
  const tot = amounts.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  return amounts.map((amount, i) => {
    const len = (amount / tot) * 100;
    const seg = { start: acc, len, vis: Math.max(0.5, len - (amounts.length > 1 ? gap : 0)), width: i === 0 ? 22 : 14 };
    acc += len;
    return seg;
  });
}
