// Recurring expenses (UI redesign merge 3; UI-REDESIGN-AUDIT §1.12–1.13, §3 D).
// Pure date + money logic shared by the Recurring screens and, in 3·5, the
// cron. Dates are local calendar days as "YYYY-MM-DD" strings, never Dates
// with a time, so no timezone shift can move a charge to the wrong day.
import { CATEGORY_LABEL, isExpenseCategory, type ExpenseCategory } from '@/lib/expenses';

/** Recurring lives under Books (L14). */
export const RECURRING_PATH = '/dashboard/recurring';

export type Cadence = 'weekly' | 'monthly' | 'yearly';
export const CADENCES: readonly Cadence[] = ['weekly', 'monthly', 'yearly'];
export const CADENCE_LABEL: Record<Cadence, string> = { weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };

export type Recurring = {
  id: string;
  vendor: string;
  description: string | null;
  amount: number;
  category: ExpenseCategory;
  cadence: Cadence;
  anchor_day: number | null;
  next_on: string;
  auto_log: boolean;
  last_logged_on: string | null;
  last_skipped_on: string | null;
  last_skip_reason: 'free_limit' | 'error' | null;
};

export const RECURRING_COLS =
  'id, vendor, description, amount, category, cadence, anchor_day, next_on, auto_log, last_logged_on, last_skipped_on, last_skip_reason';

const isCadence = (v: unknown): v is Cadence => v === 'weekly' || v === 'monthly' || v === 'yearly';
const isYmd = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function normalizeRecurring(r: Record<string, unknown>): Recurring {
  const reason = r.last_skip_reason;
  return {
    id: String(r.id),
    vendor: String(r.vendor ?? ''),
    description: typeof r.description === 'string' ? r.description : null,
    amount: Number(r.amount ?? 0),
    category: isExpenseCategory(r.category) ? r.category : 'other',
    cadence: isCadence(r.cadence) ? r.cadence : 'monthly',
    anchor_day: r.anchor_day == null ? null : Number(r.anchor_day),
    next_on: isYmd(r.next_on) ? r.next_on : '1970-01-01',
    auto_log: r.auto_log !== false,
    last_logged_on: isYmd(r.last_logged_on) ? r.last_logged_on : null,
    last_skipped_on: isYmd(r.last_skipped_on) ? r.last_skipped_on : null,
    last_skip_reason: reason === 'free_limit' || reason === 'error' ? reason : null,
  };
}

// ── Calendar days ───────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0');
const parts = (ymd: string) => ymd.split('-').map(Number) as [number, number, number];
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m: 1–12
export const ymdOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** The device's local today. */
export function localToday(now: Date = new Date()): string {
  return ymdOf(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Today in an IANA zone (UTC when unknown) — what the cron uses per owner. */
export function todayIn(timeZone: string | null | undefined, now: Date = new Date()): string {
  if (timeZone) {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    } catch { /* unknown zone → UTC */ }
  }
  return now.toISOString().slice(0, 10);
}

export function addDays(ymd: string, n: number): string {
  const [y, m, d] = parts(ymd);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return ymdOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export const daysBetween = (a: string, b: string) => {
  const [ay, am, ad] = parts(a); const [by, bm, bd] = parts(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
};

/** The day of month a monthly / yearly item charges on (from its next charge); weekly has none. */
export function anchorFor(cadence: Cadence, nextOn: string): number | null {
  return cadence === 'weekly' ? null : parts(nextOn)[2];
}

/**
 * The due date after `ymd`. Monthly and yearly keep the anchor day, clamped to
 * the month's length (31 → Feb 28 / 29, Apr 30), and return to it after a
 * short month: Jan 31 → Feb 28 → Mar 31.
 */
export function nextDue(ymd: string, cadence: Cadence, anchorDay: number | null): string {
  if (cadence === 'weekly') return addDays(ymd, 7);
  const [y, m, d] = parts(ymd);
  const anchor = anchorDay ?? d;
  const ny = cadence === 'yearly' ? y + 1 : m === 12 ? y + 1 : y;
  const nm = cadence === 'yearly' ? m : m === 12 ? 1 : m + 1;
  return ymdOf(ny, nm, Math.min(anchor, daysIn(ny, nm)));
}

/** The first due date on or after `today` (Log automatically turned back on: no back-fill, L15). */
export function firstDueFrom(nextOn: string, cadence: Cadence, anchorDay: number | null, today: string): string {
  let d = nextOn;
  for (let i = 0; d < today && i < 2000; i++) d = nextDue(d, cadence, anchorDay);
  return d;
}

// ── The cron (3·5) ──────────────────────────────────────────────────
/** At most this many due dates per item per run; the rest drain on later runs. */
export const CATCH_UP_CAP = 12;
/** Error retries stop once the stuck date is this many days behind today (D, D+1, D+2 = 3 days). */
export const ERROR_GIVE_UP_DAYS = 2;

/**
 * What the cron tries for one item this run. `start` is the first due date on
 * or after the day the item was created (owner-local), so it never logs a
 * charge from before the item existed; when it differs from next_on the cron
 * moves next_on there even if nothing is due. `dates` are the due dates on or
 * before today, oldest first, at most `cap`.
 */
export function dueDates(
  nextOn: string, cadence: Cadence, anchorDay: number | null, today: string, createdOn: string, cap = CATCH_UP_CAP,
): { start: string; dates: string[] } {
  const start = firstDueFrom(nextOn, cadence, anchorDay, createdOn);
  const dates: string[] = [];
  for (let d = start; d <= today && dates.length < cap; d = nextDue(d, cadence, anchorDay)) dates.push(d);
  return { start, dates };
}

/** After an error on `dueOn`: stop retrying (pause the item) once it's been stuck for 3 calendar days. */
export const givesUpOnError = (dueOn: string, today: string) => daysBetween(dueOn, today) >= ERROR_GIVE_UP_DAYS;

/** What one item costs per month: weekly × 52 / 12, yearly / 12. */
export function monthlyAmount(r: Pick<Recurring, 'amount' | 'cadence'>): number {
  return r.cadence === 'weekly' ? (r.amount * 52) / 12 : r.cadence === 'yearly' ? r.amount / 12 : r.amount;
}

/** "$X per month": every live item, paused ones included (they're still projected, L3). */
export function monthlyTotal(items: Pick<Recurring, 'amount' | 'cadence'>[]): number {
  return Math.round(items.reduce((s, r) => s + monthlyAmount(r), 0) * 100) / 100;
}

export type Upcoming = { date: string; item: Recurring };

/** Charges due in the next `days` local days from `today` (weekly items repeat). */
export function upcoming(items: Recurring[], today: string, days = 14): Upcoming[] {
  const end = addDays(today, days - 1);
  const out: Upcoming[] = [];
  for (const item of items) {
    let d = firstDueFrom(item.next_on, item.cadence, item.anchor_day, today);
    for (let i = 0; d <= end && i < 10; i++) { out.push({ date: d, item }); d = nextDue(d, item.cadence, item.anchor_day); }
  }
  return out.sort((a, b) => (a.date === b.date ? a.item.vendor.localeCompare(b.item.vendor) : a.date < b.date ? -1 : 1));
}

// ── Display ─────────────────────────────────────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Nov 2"; "Nov 2, 2027" when not this year. */
export function shortDay(ymd: string, today: string): string {
  const [y, m, d] = parts(ymd);
  return y === parts(today)[0] ? `${MONTHS[m - 1]} ${d}` : `${MONTHS[m - 1]} ${d}, ${y}`;
}
/** "OCT 6" for the Next 2 weeks rows. */
export const dayTag = (ymd: string) => { const [, m, d] = parts(ymd); return `${MONTHS[m - 1].toUpperCase()} ${d}`; };
/** "Nov 2, 2026" for the Next charge chip. */
export const longDay = (ymd: string) => { const [y, m, d] = parts(ymd); return `${MONTHS[m - 1]} ${d}, ${y}`; };

/** The row's sub line: "Subscriptions · Monthly". */
export const recurringSubtitle = (r: Pick<Recurring, 'category' | 'cadence'>) => `${CATEGORY_LABEL[r.category]} · ${CADENCE_LABEL[r.cadence]}`;

/** The row's right-hand line: "Next Nov 2", or "Paused". */
export function nextLine(r: Pick<Recurring, 'auto_log' | 'next_on' | 'cadence' | 'anchor_day'>, today: string): string {
  if (!r.auto_log) return 'Paused';
  return `Next ${shortDay(firstDueFrom(r.next_on, r.cadence, r.anchor_day, today), today)}`;
}

/** The skip notice on a row (L3): the latest charge On It couldn't log, if it hasn't logged one since. */
export function skipNotice(r: Pick<Recurring, 'vendor' | 'last_skipped_on' | 'last_logged_on' | 'last_skip_reason'>): string | null {
  if (!r.last_skipped_on || !r.last_skip_reason) return null;
  if (r.last_logged_on && r.last_logged_on >= r.last_skipped_on) return null;
  return r.last_skip_reason === 'free_limit'
    ? `Couldn’t log ${r.vendor}, free limit reached`
    : `Couldn’t log ${r.vendor} on ${MONTHS[parts(r.last_skipped_on)[1] - 1]} ${parts(r.last_skipped_on)[2]}`;
}

// ── The edit form ───────────────────────────────────────────────────
export const VENDOR_MAX = 120;
export const AMOUNT_MAX = 10_000_000;

/** Parse "$1,200.50" → 1200.5; null when empty; NaN when unreadable or out of range. */
export function parseAmount(s: string): number | null {
  const t = s.replace(/[$,\s]/g, '');
  if (!t) return null;
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(t)) return NaN;
  const n = Number(t);
  return n > 0 && n <= AMOUNT_MAX ? n : NaN;
}

/** The Books row (frame 5a): "7 charges · next Oct 6" and the monthly total. Paused items count but never set "next". */
export function booksLine(items: Recurring[], today: string): { caption: string; monthly: number | null } {
  if (items.length === 0) return { caption: 'Rent, software, insurance — set once', monthly: null };
  const next = items.filter((r) => r.auto_log)
    .map((r) => firstDueFrom(r.next_on, r.cadence, r.anchor_day, today)).sort()[0];
  const n = `${items.length} ${items.length === 1 ? 'charge' : 'charges'}`;
  return { caption: next ? `${n} · next ${shortDay(next, today)}` : `${n} · all paused`, monthly: monthlyTotal(items) };
}

/** Active skip notices across items, newest first (the Books banner, L3). */
export function skipNotices(items: Recurring[]): { id: string; text: string; on: string }[] {
  return items.flatMap((r) => { const t = skipNotice(r); return t ? [{ id: r.id, text: t, on: r.last_skipped_on! }] : []; })
    .sort((a, b) => (a.on < b.on ? 1 : a.on > b.on ? -1 : 0));
}

/** An auto-logged expense row (expenses.recurring_id set) still fresh enough to say "Logged automatically" (24 h). */
export function freshAutoLog(row: { recurring_id?: string | null; created_at?: string | null }, now: number = Date.now()): boolean {
  if (!row.recurring_id || !row.created_at) return false;
  const t = Date.parse(row.created_at);
  return Number.isFinite(t) && now - t >= 0 && now - t < 24 * 3600e3;
}
