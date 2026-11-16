// What the redesign's slides read from the payload. Numbers are the payload's
// own; nothing here adds money up (RULES 4, "never compute money in a component").
// "Money in" is collected.total, income.total only for a payload stored before it.
import type { RecapPayload } from '@/lib/recap/payload';

export const collectedOf = (p: RecapPayload) => p.collected?.total ?? p.income.total;
export const invoicesPaidTotal = (p: RecapPayload) => p.collected?.invoices ?? p.income.total;
export const otherReceivedTotal = (p: RecapPayload) => p.collected?.other ?? 0;
export const paymentsCount = (p: RecapPayload) => p.collected?.payments ?? p.income.payments;
export const clientsCount = (p: RecapPayload) => p.collected?.clients ?? p.income.clients;

/** "Nov 9 – 15" inside one month, "Oct 28 – Nov 3" across two (the design's range line). */
export function rangeLabel(p: Pick<RecapPayload, 'start' | 'end'>) {
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [, m1, d1] = p.start.split('-').map(Number);
  const [, m2, d2] = p.end.split('-').map(Number);
  return m1 === m2 ? `${MON[m1 - 1]} ${d1} – ${d2}` : `${MON[m1 - 1]} ${d1} – ${MON[m2 - 1]} ${d2}`;
}
