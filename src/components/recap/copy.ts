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

/** Compact currency for chart labels: "$840", "$1.2k", "$12k", "$1.2M"
 *  (thresholds on the rounded value, so $999.6k reads "$1M", never "$1,000k"). */
export function compactMoney(n: number): string {
  const sign = n < 0 ? '−' : '';
  const a = Math.abs(n);
  const one = (v: number) => v.toFixed(1).replace(/\.0$/, '');
  if (Math.round(a) < 1000) return `${sign}$${Math.round(a)}`;
  if (Math.round(a / 100) / 10 < 10) return `${sign}$${one(a / 1000)}k`;
  if (Math.round(a / 1000) < 1000) return `${sign}$${Math.round(a / 1000)}k`;
  return `${sign}$${one(a / 1e6)}M`;
}
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

/** The encouragement line under Money in (design: the slow week's "One job, done
 *  and paid. That counts."). Only a quiet period gets one: a single payment, or
 *  less collected than the period before. Never about what went wrong. */
export function moneyInNote(p: Pick<RecapPayload, 'kind' | 'income' | 'collected' | 'previous'>): string | null {
  const total = p.collected?.total ?? p.income.total;
  if (!(total > 0)) return null;
  const payments = p.collected?.payments ?? p.income.payments;
  if (payments === 1) return 'One job, done and paid. That counts.';
  if (p.previous && total < p.previous.income) return `A lighter ${per(p)}. The work still counts.`;
  return null;
}

/** The encouragement line on What you kept, drawn only when there is no change
 *  chip (design: "Every dollar stayed with you this week."). A week that spent
 *  more than it collected reads as an investment, never a loss (RULE 11). */
export function keptNote(p: Pick<RecapPayload, 'kind' | 'net' | 'spend' | 'income' | 'collected' | 'change' | 'start'>): string | null {
  if (changeLine(p)) return null;
  const total = p.collected?.total ?? p.income.total;
  if (p.net < 0) return `Money went back into the business this ${per(p)}. That’s how it grows.`;
  if (p.spend.total <= 0) return total > 0 ? `Every dollar stayed with you this ${per(p)}.` : null;
  return p.net > 0 ? `You kept more than you spent this ${per(p)}.` : null;
}
