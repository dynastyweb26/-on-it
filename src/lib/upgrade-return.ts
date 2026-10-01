'use client';
// Coming back from Stripe Checkout (success_url …?upgraded=1).
//
// The subscription reaches our database through the Stripe webhook, usually a
// second or two AFTER the browser lands back here. Until then hasAccess() still
// reports the free tier, so the very tap that brought the user back (Send on
// the blocked invoice card, Save on an expense, an export) would show the wall
// again. For a few minutes after an upgrade return, a gate that says "no"
// re-checks /api/access for a short while before giving that answer.

const KEY = 'onit_upgraded_at';
const WINDOW_MS = 15 * 60 * 1000;

/** Call once on mount of a screen Checkout can return to: records the return
 *  and drops ?upgraded=1 from the address so a reload doesn't re-trigger it. */
export function noteUpgradeReturn(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (url.searchParams.get('upgraded') !== '1') return;
  try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* storage blocked */ }
  url.searchParams.delete('upgraded');
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
}

export function recentlyUpgraded(): boolean {
  try {
    const at = Number(sessionStorage.getItem(KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < WINDOW_MS;
  } catch {
    return false;
  }
}

type Access = { hasAccess?: boolean; canExpense?: boolean; canExport?: boolean; [k: string]: unknown };

/** Re-read /api/access until `ok(access)` is true (about 9 s at most). Returns
 *  the last access read, or null if it never answered. */
export async function waitForAccess(ok: (a: Access) => boolean, tries = 6, everyMs = 1500): Promise<Access | null> {
  let last: Access | null = null;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch('/api/access', { cache: 'no-store' });
      if (r.ok) {
        last = (await r.json()) as Access;
        if (ok(last)) return last;
      }
    } catch { /* keep trying */ }
    await new Promise((res) => setTimeout(res, everyMs));
  }
  return last;
}
