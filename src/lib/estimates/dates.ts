// Date arithmetic for estimate expiry.
//
// valid_until is a DATE. An estimate is valid through the END of that calendar
// day in the business's timezone, so the first expired instant is local
// midnight of the following day. Everything here uses that one rule; the SQL
// helper public.estimate_expires_at(date, text) implements the same boundary.

export const DEFAULT_TIME_ZONE = 'America/Chicago';

type DateParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

/** A valid IANA zone, or the documented fallback. `Intl` throws on garbage, so
 *  a bad profile value falls back instead of breaking the page. */
export function resolveTimeZone(tz: string | null | undefined): string {
  const candidate = (tz ?? '').trim();
  if (!candidate) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

function partsInTimeZone(date: Date, tz: string): DateParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/** How far `at` is from UTC, in milliseconds, at that instant in `tz`. */
function offsetMs(tz: string, at: Date): number {
  const p = partsInTimeZone(at, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Local midnight in `tz` → the UTC instant. Two passes handle DST. */
function zonedMidnight(tz: string, year: number, month: number, day: number): Date {
  const guess = Date.UTC(year, month - 1, day);
  let ts = guess - offsetMs(tz, new Date(guess));
  ts = guess - offsetMs(tz, new Date(ts));
  return new Date(ts);
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse a real yyyy-mm-dd (not 2026-02-31). Returns null on anything else. */
export function parseDateOnly(value: string | null | undefined): DateParts | null {
  if (!value) return null;
  const m = DATE_ONLY.exec(value.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day, hour: 0, minute: 0, second: 0 };
}

export function isDateOnly(value: string | null | undefined): boolean {
  return parseDateOnly(value) !== null;
}

/** The first instant the estimate is expired: local midnight after the date. */
export function endOfDayInstant(validUntil: string, tz?: string | null): Date | null {
  const p = parseDateOnly(validUntil);
  if (!p) return null;
  return zonedMidnight(resolveTimeZone(tz), p.year, p.month, p.day + 1);
}

/** Today's calendar date (yyyy-mm-dd) in the business timezone. */
export function todayInTimeZone(now: Date, tz?: string | null): string {
  const p = partsInTimeZone(now, resolveTimeZone(tz));
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Add calendar days to a date-only string (UTC math; no DST drift). */
export function addDaysToDateString(value: string, days: number): string {
  const p = parseDateOnly(value);
  if (!p) return value;
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
}

/** Whole calendar days from `from` to `to` (both date-only). */
export function calendarDaysBetween(from: string, to: string): number | null {
  const a = parseDateOnly(from);
  const b = parseDateOnly(to);
  if (!a || !b) return null;
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000,
  );
}

/** A requested expiry must be today or later in the business timezone. */
export function isOnOrAfterToday(value: string, now: Date, tz?: string | null): boolean {
  const days = calendarDaysBetween(todayInTimeZone(now, tz), value);
  return days !== null && days >= 0;
}

/** The default expiry assigned on the first send that has none: local today + 30. */
export function defaultValidUntil(now: Date, tz?: string | null): string {
  return addDaysToDateString(todayInTimeZone(now, tz), 30);
}
