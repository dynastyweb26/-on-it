// In-chat recap cards (alive layer 07 "recap" + 08 "Recaps" rows). Pure: the
// windows, the sums, the bar heights and the words. No cron: a card is built on
// app open (daily after 7:00 local, weekly on Monday after 7:00) or when asked
// ("How did today go?", "How'd I do this week?"). Nothing here touches the
// network; the loader hands it rows.
//
// The existing src/components/recap/* is the "Wrapped" story (weekly/monthly
// slides). It is a different feature; these cards do not read from it.

export type RecapKind = 'daily' | 'weekly';
/** auto = the finished period (yesterday / last week); now = the period so far. */
export type RecapMode = 'auto' | 'now';

export interface PaymentRow { amount: number | string; paid_at: string; entry_type?: string | null }
export interface OpenInvoiceRow { total: number | string; amount_paid: number | string | null; status: string; due_date: string | null }
export interface SignedRow { approved_at: string }

export interface RecapInput {
  now: Date;
  kind: RecapKind;
  mode: RecapMode;
  /** At least ~12 weeks back, so "best week since …" has something to compare. */
  payments: PaymentRow[];
  open: OpenInvoiceRow[];
  signed: SignedRow[];
  /** The owner's first name when the app knows it. It does not today. */
  ownerFirst?: string | null;
}

export interface RecapModel {
  kind: RecapKind;
  /** "Morning recap · Fri Nov 7" / "Week of Nov 3" */
  metaLabel: string;
  title: string;
  moneyIn: number;
  owed: number;
  overdue: number;
  signed: number;
  /** Weekly only: seven bars, Monday first. pct 0..100, best = the peak day. */
  bars: { pct: number; best: boolean }[] | null;
}

const DAY = 86400e3;
const pad = (n: number) => String(n).padStart(2, '0');

export const startOfLocalDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const dayKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The Monday on or before `d`, local midnight. */
export function startOfWeekMonday(d: Date): Date {
  const s = startOfLocalDay(d);
  const back = (s.getDay() + 6) % 7; // Mon=0 … Sun=6
  return new Date(s.getFullYear(), s.getMonth(), s.getDate() - back);
}

export const weekKey = (d: Date): string => dayKey(startOfWeekMonday(d));

export function window_(kind: RecapKind, mode: RecapMode, now: Date): { start: Date; end: Date } {
  if (kind === 'daily') {
    const today = startOfLocalDay(now);
    return mode === 'auto'
      ? { start: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1), end: today }
      : { start: today, end: now };
  }
  const thisMonday = startOfWeekMonday(now);
  return mode === 'auto'
    ? { start: new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - 7), end: thisMonday }
    : { start: thisMonday, end: now };
}

const isPayment = (p: PaymentRow) => !p.entry_type || p.entry_type === 'payment';
const amt = (n: number | string | null | undefined) => { const v = Number(n); return Number.isFinite(v) ? v : 0; };

export function sumPayments(rows: PaymentRow[], start: Date, end: Date): number {
  let t = 0;
  for (const p of rows) {
    if (!isPayment(p)) continue;
    const at = Date.parse(p.paid_at);
    if (at >= start.getTime() && at < end.getTime()) t += amt(p.amount);
  }
  return Math.round(t * 100) / 100;
}

/** What is still owed on sent invoices, and how many are overdue (status, or a
 *  due date before today on one still open). */
export function owedAndOverdue(open: OpenInvoiceRow[], now: Date): { owed: number; overdue: number } {
  const today = dayKey(now);
  let owed = 0;
  let overdue = 0;
  for (const i of open) {
    if (i.status !== 'sent' && i.status !== 'overdue') continue;
    const left = Math.max(0, amt(i.total) - amt(i.amount_paid));
    if (left <= 0) continue;
    owed += left;
    if (i.status === 'overdue' || (i.due_date != null && i.due_date < today)) overdue += 1;
  }
  return { owed: Math.round(owed * 100) / 100, overdue };
}

/** Seven day bars from Monday `start`. A day with money never rounds to nothing. */
export function weekBars(payments: PaymentRow[], start: Date): { pct: number; best: boolean }[] {
  const totals = Array.from({ length: 7 }, (_, i) => {
    const a = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const b = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i + 1);
    return sumPayments(payments, a, b);
  });
  const max = Math.max(...totals);
  if (max <= 0) return totals.map(() => ({ pct: 0, best: false }));
  const peak = totals.indexOf(max);
  return totals.map((t, i) => ({ pct: t > 0 ? Math.max(5, Math.round((t / max) * 100)) : 0, best: i === peak }));
}

const whole = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const monthName = (d: Date) => d.toLocaleDateString('en-US', { month: 'long' });

/** "Best week since August": the month of the most recent EARLIER week (at least
 *  two weeks back) that did as well. Null when no earlier week did, because the
 *  data cannot support the claim ("best ever"), or when the week was quiet. */
export function bestWeekSince(payments: PaymentRow[], weekStart: Date, thisTotal: number): string | null {
  if (thisTotal <= 0) return null;
  for (let back = 2; back <= 14; back++) {
    const a = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() - back * 7);
    const b = new Date(a.getFullYear(), a.getMonth(), a.getDate() + 7);
    if (sumPayments(payments, a, b) >= thisTotal) return monthName(a);
  }
  return null;
}

export function buildRecap(i: RecapInput): RecapModel {
  const { start, end } = window_(i.kind, i.mode, i.now);
  const moneyIn = sumPayments(i.payments, start, end);
  const { owed, overdue } = owedAndOverdue(i.open, i.now);
  const signed = i.signed.filter((s) => { const t = Date.parse(s.approved_at); return t >= start.getTime() && t < end.getTime(); }).length;

  if (i.kind === 'daily') {
    const day = `${i.now.toLocaleDateString('en-US', { weekday: 'short' })} ${i.now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`; // "Fri Nov 7"
    const morning = i.mode === 'auto';
    const first = i.ownerFirst?.trim();
    return {
      kind: 'daily',
      metaLabel: morning ? `Morning recap · ${day}` : `Today so far · ${day}`,
      title: morning ? (first ? `Good morning, ${first}.` : 'Good morning.') : 'Here’s today.',
      moneyIn, owed, overdue, signed, bars: null,
    };
  }

  const since = bestWeekSince(i.payments, start, moneyIn);
  const headline = `${whole(moneyIn)} in.`;
  return {
    kind: 'weekly',
    metaLabel: `Week of ${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
    title: since ? `${headline} Best week since ${since}.` : headline,
    moneyIn, owed, overdue, signed,
    bars: weekBars(i.payments, start),
  };
}

/** Nothing happened and nothing is owed: an automatic card would say nothing. */
export function isEmptyRecap(m: Pick<RecapModel, 'moneyIn' | 'owed' | 'overdue' | 'signed'>): boolean {
  return m.moneyIn <= 0 && m.owed <= 0 && m.overdue === 0 && m.signed === 0;
}

/** Which automatic recaps are due on this open. Daily after 7:00 local, once per
 *  day; weekly on Monday after 7:00, once per week. */
export function recapsDue(now: Date, last: { daily?: string | null; weekly?: string | null }): RecapKind[] {
  if (now.getHours() < 7) return [];
  const out: RecapKind[] = [];
  if (last.daily !== dayKey(now)) out.push('daily');
  if (now.getDay() === 1 && last.weekly !== weekKey(now)) out.push('weekly');
  return out;
}

/** "How did today go?" and "How'd I do this week?" (and close cousins). Narrow:
 *  anything carrying a job is a normal message. */
export function matchRecap(text: string): RecapKind | null {
  const t = text.trim().toLowerCase().replace(/[’`]/g, "'").replace(/[?!.]+$/g, '').replace(/\s+/g, ' ');
  if (!t) return null;
  if (/^(how did today go|how's today going|how is today going|daily recap|today's recap|recap (of )?today)$/.test(t)) return 'daily';
  if (/^(how'd i do this week|how did i do this week|how's my week going|how is my week going|weekly recap|this week's recap|recap (of )?(this|the) week)$/.test(t)) return 'weekly';
  return null;
}

export const RECAP_DAY_MS = DAY;
