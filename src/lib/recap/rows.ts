// Recap rows as the app reads them (public.recaps, own rows by RLS), and the
// pure rules the in-app access follows (RECAP-SPEC §0b, commit 14):
//   • prompt — the newest recap from the last 14 days that is neither watched
//     (seen_at) nor put off (prompted_at), and announces (not nothing-at-all);
//   • Books tab dot — any such recap still unwatched (prompted or not);
//   • "from the last 14 days" = its period ended at most 14 days ago (local).
// Pure (no Supabase), so it is unit-tested.
import { daysBetween } from './dates';
import { RECAP_PAYLOAD_VERSION, recapAnnounces, type RecapPayload } from './payload';

export type RecapRow = {
  id: string;
  kind: 'week' | 'month';
  period_start: string;   // yyyy-mm-dd, inclusive
  period_end: string;
  income: number;
  expenses: number;
  net: number;
  seen_at: string | null;      // watched (the story was opened)
  prompted_at: string | null;  // "Later" on the prompt sheet
  created_at: string;
  payload?: RecapPayload | null;
  payload_version?: number | null;
  /** List rows (no payload): recapFlags' "nothing at all", from four payload fields. */
  nothing?: boolean;
};

/** Columns for lists (no payload: up to 16 KB each). */
export const RECAP_LIST_COLS = 'id, kind, period_start, period_end, income, expenses, net, seen_at, prompted_at, created_at';
/** Columns for rows the story may open. */
export const RECAP_FULL_COLS = `${RECAP_LIST_COLS}, payload, payload_version`;
/** The history list: list columns + just the payload fields recapFlags'
 *  "nothing" needs (PostgREST JSON paths), so no full payload per row. */
export const RECAP_HISTORY_COLS = `${RECAP_LIST_COLS}, payload_version, `
  + 'p_in:payload->income->>total, p_out:payload->spend->>total, p_owed:payload->owed->>count, p_paid:payload->paid->>count';

export const RECENT_DAYS = 14;

/** Supabase numeric columns arrive as strings. */
export function normalizeRow(r: Record<string, unknown>): RecapRow {
  const { p_in, p_out, p_owed, p_paid, ...rest } = r;
  const row: RecapRow = {
    ...(rest as unknown as RecapRow),
    income: Number(r.income ?? 0),
    expenses: Number(r.expenses ?? 0),
    net: Number(r.net ?? 0),
  };
  if (p_in !== undefined) row.nothing = [p_in, p_out, p_owed, p_paid].every((v) => Number(v ?? 0) === 0);
  return row;
}

/** The stored story can be played by this build. */
export const playable = (r: RecapRow): r is RecapRow & { payload: RecapPayload } =>
  !!r.payload && typeof r.payload === 'object' && r.payload_version === RECAP_PAYLOAD_VERSION;

/** Worth announcing (prompt, dot, ring): not a nothing-at-all period, and
 *  playable — from the payload, or a list row's `nothing` + version. */
export const announces = (r: RecapRow) =>
  playable(r) ? recapAnnounces(r.payload)
    : r.nothing !== undefined && r.payload_version === RECAP_PAYLOAD_VERSION && !r.nothing;

export const isRecent = (r: Pick<RecapRow, 'period_end'>, today: string) =>
  daysBetween(r.period_end, today) <= RECENT_DAYS;

const newestFirst = (a: RecapRow, b: RecapRow) =>
  b.period_end.localeCompare(a.period_end) || (a.kind === 'month' ? -1 : b.kind === 'month' ? 1 : 0);

export function sortRows(rows: RecapRow[]): RecapRow[] {
  return [...rows].sort(newestFirst);
}

/** The recap the Watch/Later sheet offers on this app open, if any. */
export function promptPick(rows: RecapRow[], today: string): RecapRow | null {
  return sortRows(rows).find((r) => !r.seen_at && !r.prompted_at && isRecent(r, today) && announces(r)) ?? null;
}

/** The Books tab dot: an unwatched recap from the last 14 days. */
export function hasUnwatched(rows: RecapRow[], today: string): boolean {
  return rows.some((r) => !r.seen_at && isRecent(r, today) && announces(r));
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const ymd = (iso: string) => iso.split('-').map(Number) as [number, number, number];

/** "Week of Sep 22 – 28" (or "Sep 29 – Oct 5" across months) / "September 2026". */
export function rowLabel(r: Pick<RecapRow, 'kind' | 'period_start' | 'period_end'>): string {
  const [y, m, d] = ymd(r.period_start);
  if (r.kind === 'month') return `${MONTHS[m - 1]} ${y}`;
  const [, m2, d2] = ymd(r.period_end);
  const mon = (k: number) => MONTHS[k - 1].slice(0, 3);
  return m === m2 ? `Week of ${mon(m)} ${d} – ${d2}` : `Week of ${mon(m)} ${d} – ${mon(m2)} ${d2}`;
}

/** "Your week is ready" / "Your September is ready" (the push copy, §8). */
export function readyTitle(r: Pick<RecapRow, 'kind' | 'period_start'>): string {
  return r.kind === 'week' ? 'Your week is ready' : `Your ${MONTHS[ymd(r.period_start)[1] - 1]} is ready`;
}
