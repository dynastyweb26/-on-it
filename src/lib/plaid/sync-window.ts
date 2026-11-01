// ═══ Sync window + safe error text (pure) ═══
// Kept out of sync.ts so the staging window and the stored error string are
// unit-tested without importing server-only code.

export const LOOKBACK_DAYS = 30;
/** PLAID_BACKFILL_DAYS may never reach further back than this. */
export const BACKFILL_MAX_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

const isoDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/**
 * PLAID_BACKFILL_DAYS: whole days of history to stage before the link date.
 * Unset, blank or junk is 0 (start at the link date); 0–90, clamped. Negative
 * or fractional input is junk, not a number to round.
 */
export function backfillDays(raw: string | undefined): number {
  const text = (raw ?? '').trim();
  if (!/^\d+$/.test(text)) return 0;
  return Math.min(Number(text), BACKFILL_MAX_DAYS);
}

/**
 * The link date minus PLAID_BACKFILL_DAYS, but never later than today − 30d:
 * the later of the two. The backfill can reach before the link date, and the
 * ~30 day staging cap still wins. A re-login keeps the original linked_at, so
 * it keeps its window.
 */
export function syncWindowStart(
  linkedAt: string,
  nowMs: number = Date.now(),
  env: Record<string, string | undefined> = process.env,
): string {
  const linkedDay = linkedAt.slice(0, 10);
  const cap = isoDay(nowMs - LOOKBACK_DAYS * DAY_MS);
  const days = backfillDays(env.PLAID_BACKFILL_DAYS);
  if (days === 0) return linkedDay > cap ? linkedDay : cap;

  const linkedMs = Date.parse(`${linkedDay}T00:00:00.000Z`);
  if (!Number.isFinite(linkedMs)) return linkedDay > cap ? linkedDay : cap;

  const start = isoDay(linkedMs - days * DAY_MS);
  return start > cap ? start : cap;
}

/**
 * last_sync_error and webhook reasons: a Plaid code plus an optional message,
 * capped to the column's 400 characters. No access token, no request body.
 */
export function syncErrorText(error: unknown): string {
  const e = error as { error_code?: unknown; error_type?: unknown; message?: unknown } | null;
  const code =
    (typeof e?.error_code === 'string' && e.error_code) ||
    (typeof e?.error_type === 'string' && e.error_type) ||
    'sync_failed';
  const message = typeof e?.message === 'string' ? e.message : '';
  const text = message && message !== code ? `${code}: ${message}` : code;
  return text.slice(0, 400);
}
