// Recap periods and timezone-safe local dates. Pure (no server-only imports),
// so the cron builder, the payload builder and the unit tests share them.
// Moved out of lib/notify/recaps.ts, which re-exports them.

export const DEFAULT_RECAP_TZ = 'America/Chicago';

export type RecapKind = 'week' | 'month';
export type RecapPeriod = { kind: RecapKind; start: string; end: string }; // local yyyy-mm-dd, inclusive

const pad = (n: number) => String(n).padStart(2, '0');

/** A zone this runtime knows, else the default. */
export function resolveTimeZone(tz: string | null | undefined): string {
  if (tz) {
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { /* unknown zone */ }
  }
  return DEFAULT_RECAP_TZ;
}

/** The local calendar date (yyyy-mm-dd) in `tz` at instant `at`. */
export function localYmd(tz: string, at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Whole days from `a` to `b` (both yyyy-mm-dd). */
export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400e3);
}

/** The periods that close on local date `today`: the previous Mon–Sun on a
 *  Monday, the previous calendar month on the 1st (both on a Monday the 1st). */
export function periodsEndingBefore(today: string): RecapPeriod[] {
  const [y, m, d] = today.split('-').map(Number);
  const out: RecapPeriod[] = [];
  if (d === 1) {
    const first = new Date(Date.UTC(y, m - 2, 1)); // previous month, day 1 (Date.UTC wraps the year)
    out.push({ kind: 'month', start: `${first.getUTCFullYear()}-${pad(first.getUTCMonth() + 1)}-01`, end: addDays(today, -1) });
  }
  if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 1) {
    out.push({ kind: 'week', start: addDays(today, -7), end: addDays(today, -1) });
  }
  return out;
}

/** The last `weeks` completed Mon–Sun weeks and `months` completed calendar
 *  months before local date `today`, newest first within each kind (the
 *  preview's "build my recaps" backfill; the cron only builds what closes today). */
export function recentPeriods(today: string, weeks: number, months: number): RecapPeriod[] {
  const out: RecapPeriod[] = [];
  const [y, m, d] = today.split('-').map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // Mon = 0
  let monday = addDays(today, -dow - 7);                               // last completed week's Monday
  for (let i = 0; i < weeks; i++, monday = addDays(monday, -7)) out.push({ kind: 'week', start: monday, end: addDays(monday, 6) });
  let end = addDays(`${today.slice(0, 8)}01`, -1);                      // last day of last month
  for (let i = 0; i < months; i++) {
    const start = `${end.slice(0, 8)}01`;
    out.push({ kind: 'month', start, end });
    end = addDays(start, -1);
  }
  return out;
}

/** The period just before `p`, for "Up 18% from last week": the previous
 *  7 days for a week, the previous calendar month for a month. */
export function previousPeriod(p: RecapPeriod): RecapPeriod {
  if (p.kind === 'week') return { kind: 'week', start: addDays(p.start, -7), end: addDays(p.start, -1) };
  const end = addDays(p.start, -1);
  return { kind: 'month', start: `${end.slice(0, 8)}01`, end };
}

/** UTC offset of `tz` at instant `at`, in ms (local − UTC). */
function tzOffsetMs(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant of local midnight starting `ymd` in `tz` (DST-safe). */
export function zonedMidnight(ymd: string, tz: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - tzOffsetMs(tz, new Date(guess));
  t = guess - tzOffsetMs(tz, new Date(t)); // second pass lands DST transitions
  return new Date(t);
}
