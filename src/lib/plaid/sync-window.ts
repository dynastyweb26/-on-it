// ═══ Sync window + safe error text (pure) ═══
// Kept out of sync.ts so the staging window and the stored error string are
// unit-tested without importing server-only code.

export const LOOKBACK_DAYS = 30;

const isoDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/**
 * The link date, but never further back than the ~30 day staging cap. A
 * re-login keeps the original linked_at, so it keeps its window.
 */
export function syncWindowStart(linkedAt: string, nowMs: number = Date.now()): string {
  const linked = linkedAt.slice(0, 10);
  const cap = isoDay(nowMs - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  return linked > cap ? linked : cap;
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
