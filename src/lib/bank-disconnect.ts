// ═══ Bank disconnect — the one call the disconnect sheet makes ═══
// POST /api/plaid/disconnect (preview-only). The screen keeps the connection
// and shows this toast unless the server confirms; only a real item id is sent,
// never an access token or an email.
export const DISCONNECT_FAILED_TOAST =
  'We couldn’t disconnect that bank. Your connection is still active.';

export type DisconnectResult = { ok: true } | { ok: false; message: string };

export async function requestDisconnect(
  itemId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DisconnectResult> {
  try {
    const res = await fetchImpl('/api/plaid/disconnect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ item_id: itemId }),
    });
    if (res.ok) return { ok: true };
  } catch {
    // Offline or the route never answered: same outcome as a refusal.
  }
  return { ok: false, message: DISCONNECT_FAILED_TOAST };
}
