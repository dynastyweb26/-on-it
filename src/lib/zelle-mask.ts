// The Zelle mask (••••<last 4 characters>), derived two ways that must agree:
// from the plaintext on the server, and from profiles.zelle_last4 in Settings.
// Pure, so the route and the tests share one source.

/** What zelle_last4 stores: '' when the value is 4 characters or fewer. */
export const zelleLast4 = (v: string): string => (v.length <= 4 ? '' : v.slice(-4));

export const zelleMask = (v: string): string => `••••${zelleLast4(v)}`;

/**
 * Settings' Zelle mask, straight from the profile row (no fetch).
 *   string    → mask to show
 *   null      → nothing stored: Not set
 *   undefined → stored before zelle_last4 existed: ask /api/zelle (it backfills)
 */
export function zelleMaskFromProfile(
  p: { zelle_last4?: string | null; zelle_info_enc?: unknown },
): string | null | undefined {
  if (typeof p.zelle_last4 === 'string') return `••••${p.zelle_last4}`;
  return p.zelle_info_enc ? undefined : null;
}
