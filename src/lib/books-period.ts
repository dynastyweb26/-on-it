// ═══ Books period — the one rule for which period a row belongs to ═══
//
// The Books summary and run_report must file the same row in the same period.
// This module is that single rule:
//
//   payment      → invoice_payments.paid_at, as a local calendar day
//   expense      → expenses.spent_on, already a local calendar day
//   other income → other_income.received_on; Books reads it at noon UTC so a
//                  local-day reader keeps the received date
//
// Bounds are inclusive yyyy-mm-dd. The caller supplies the timezone: the Books
// summary uses the device's local zone, the report uses the owner's profile
// zone. "all" skips the bounds.
import { localYmd } from '@/lib/recap/dates';

export type BooksRowKind = 'payment' | 'expense' | 'other_income';

export type BooksPeriodBounds = {
  start: string;
  end: string;
  granularity?: string;
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const pad = (n: number) => String(n).padStart(2, '0');

/** The device's local calendar date, matching the Books summary's localDay(). */
function deviceDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dayInZone(date: Date, timeZone?: string): string {
  return timeZone ? localYmd(timeZone, date) : deviceDay(date);
}

/**
 * The calendar day Books files this row under. `value` is the row's date
 * column; `timeZone` is omitted only by the device-local Books summary.
 */
export function booksDay(
  kind: BooksRowKind,
  value: string | null | undefined,
  timeZone?: string,
): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';

  if (kind === 'expense') return raw;

  if (kind === 'other_income') {
    const date = raw.slice(0, 10);
    if (!ISO_DAY.test(date)) return '';
    const noonUtc = new Date(`${date}T12:00:00.000Z`);
    return Number.isNaN(noonUtc.getTime()) ? '' : dayInZone(noonUtc, timeZone);
  }

  const paidAt = new Date(raw);
  return Number.isNaN(paidAt.getTime()) ? '' : dayInZone(paidAt, timeZone);
}

/** Inclusive calendar bounds; "all" has no bounds. */
export function inBooksPeriod(day: string, period: BooksPeriodBounds): boolean {
  if (period.granularity === 'all') return true;
  return day !== '' && day >= period.start && day <= period.end;
}
