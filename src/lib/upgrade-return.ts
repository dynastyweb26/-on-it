'use client';
// Coming back from Stripe Checkout (success_url …?upgraded=1).
//
// The subscription reaches our database through the Stripe webhook, usually a
// second or two AFTER the browser lands back here. Until then hasAccess() still
// reports the free tier, so the very tap that brought the user back (Send on
// the blocked invoice card, Save on an expense, an export) would show the wall
// again. For a few minutes after an upgrade return, a gate that says "no"
// re-checks /api/access for a short while before giving that answer.

import { pollUntilPaid, type AccessRead } from '@/lib/access-poll';

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
  startUnlockPolling();
}

// ── Unlock polling ──────────────────────────────────────────────────────────
// One poll for the whole app, started by an upgrade return (above) or a code
// redeem (CodeEntry). It re-reads /api/access on a short backoff until the tier
// is paid (lib/access-poll.ts), then publishes the result: every screen that
// holds access in state subscribes, so nothing needs a manual refresh.

const EVENT = 'onit:access';
let polling: Promise<void> | null = null;

/** Tell every subscriber the access just changed. */
export function publishAccess(access: AccessRead): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<AccessRead>(EVENT, { detail: access }));
}

/** Run `fn` whenever the unlock poll sees the tier turn paid. Returns the unsubscribe. */
export function subscribeAccess(fn: (access: AccessRead) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const h = (e: Event) => fn((e as CustomEvent<AccessRead>).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

/** Poll /api/access until paid (about 20 s at most), then publish. Safe to call
 *  twice: a poll already running is reused, not doubled. */
export function startUnlockPolling(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (polling) return polling;
  polling = pollUntilPaid(
    async () => {
      const r = await fetch('/api/access', { cache: 'no-store' });
      return r.ok ? ((await r.json()) as AccessRead) : null;
    },
    (ms) => new Promise((res) => setTimeout(res, ms)),
  )
    .then((r) => { if (r.status === 'paid') publishAccess(r.access); })
    .catch(() => undefined)
    .finally(() => { polling = null; });
  return polling;
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
