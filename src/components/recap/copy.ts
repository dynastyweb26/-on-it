// Recap copy (RECAP-SPEC §8), shared by the slides.
import type { RecapPayload } from '@/lib/recap/payload';

export const AFFIRMATIONS = [
  'Keep building a business you’re proud of.',
  'Every invoice is proof of work.',
  'Steady hands. Steady growth.',
  'You showed up. It shows.',
  'Good work gets paid.',
] as const;

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const ymd = (iso: string) => iso.split('-').map(Number) as [number, number, number];
/** "Sep 22" from a local yyyy-mm-dd (no Date: the payload's days are local). */
export const shortDate = (iso: string) => { const [, m, d] = ymd(iso); return `${MON[m - 1]} ${d}`; };
/** "Sep 22 – Sep 28" / "Sep 1 – Sep 30". */
export const periodLabel = (p: Pick<RecapPayload, 'start' | 'end'>) => `${shortDate(p.start)} – ${shortDate(p.end)}`;
/** "September" for a monthly recap. */
export const monthName = (p: Pick<RecapPayload, 'start'>) => MONTH[ymd(p.start)[1] - 1];

/** Whole dollars, "−$" for negatives (the prototype's R.money). */
export const money = (n: number) => (n < 0 ? '−$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
/** "1 payment" / "4 payments". */
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** "week" / "month". */
export const per = (p: Pick<RecapPayload, 'kind'>) => (p.kind === 'month' ? 'month' : 'week');

/** The change chip on "What you kept": "Up 18% from last week" / "Down 22%
 *  from August" / "About the same as last week"; null when there's nothing
 *  to compare with (no positive previous net). */
export function changeLine(p: Pick<RecapPayload, 'kind' | 'start' | 'change'>): { dir: 'up' | 'down' | 'flat'; text: string } | null {
  const c = p.change;
  if (!c) return null;
  const vs = p.kind === 'month' ? MONTH[(ymd(p.start)[1] + 10) % 12] : 'last week';
  if (c.direction === 'flat') return { dir: 'flat', text: `About the same as ${vs}` };
  return { dir: c.direction, text: `${c.direction === 'up' ? 'Up' : 'Down'} ${c.pct}% from ${vs}` };
}
