'use client';
// Coming back from Stripe Checkout (success_url …?upgraded=1), or redeeming a
// code: getting every screen to see the new tier without a reload.
//
// The subscription reaches our database through the Stripe webhook, usually a
// second or two AFTER the browser lands back here. Until then hasAccess() still
// reports the free tier. Three things cover that gap:
// - The return itself: the success URL carries the Checkout session id, and
//   /api/checkout/confirm records the subscription from Stripe straight away
//   (the same write the webhook makes), so usually there is no gap at all.
// - The gates: for a few minutes after an upgrade return, a gate that says
//   "no" re-checks /api/access for a short while before giving that answer
//   (waitForAccess).
// - The screens: several hold a copy of the access state read when they
//   opened (Chat's profile, Recaps, Summary's export switch, Settings' plan).
//   After an upgrade return /api/access is polled until the tier is paid, and
//   every read that finds a new tier is announced (ACCESS_EVENT) so those
//   copies update in place. A code redeem announces the same way, and so does
//   the app coming back into view (Checkout may have finished in another
//   browser, e.g. Safari next to the installed iPhone app).

import { isPaidTier } from '@/lib/paywall';

const KEY = 'onit_upgraded_at';
const WINDOW_MS = 15 * 60 * 1000;
// The post-return poll: every 1.5 s for up to 20 s (14 reads, inside the
// 30-per-minute /api/access rate limit).
const POLL_EVERY_MS = 1500;
const POLL_FOR_MS = 20_000;
// The app-back-in-view re-check runs at most this often.
const RECHECK_MIN_MS = 10_000;

/** Fired on window with the fresh /api/access body as `detail`. */
export const ACCESS_EVENT = 'onit:access-changed';

export type Access = { hasAccess?: boolean; canExpense?: boolean; canExport?: boolean; tier?: string; [k: string]: unknown };

// The last tier any read here saw; null until the first one.
let lastTier: string | null = null;
let polling: Promise<Access | null> | null = null;
let lastRecheck = 0;

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function readAccess(): Promise<Access | null> {
  try {
    const r = await fetch('/api/access', { cache: 'no-store' });
    return r.ok ? ((await r.json()) as Access) : null;
  } catch {
    return null;
  }
}

/** Hand a fresh access read to every screen that keeps a copy of it. */
export function announceAccess(a: Access): void {
  lastTier = typeof a.tier === 'string' ? a.tier : null;
  window.dispatchEvent(new CustomEvent<Access>(ACCESS_EVENT, { detail: a }));
}

/** Subscribe to announced access reads; returns the unsubscribe. */
export function onAccessChange(cb: (a: Access) => void): () => void {
  const handler = (e: Event) => {
    const a = (e as CustomEvent<Access>).detail;
    if (a) cb(a);
  };
  window.addEventListener(ACCESS_EVENT, handler);
  return () => window.removeEventListener(ACCESS_EVENT, handler);
}

/** Read /api/access once; announce it when the tier moved (or wasn't known yet). */
export async function refreshAccess(): Promise<Access | null> {
  const a = await readAccess();
  if (a) {
    if (lastTier === null || a.tier !== lastTier) announceAccess(a);
    else lastTier = typeof a.tier === 'string' ? a.tier : null;
  }
  return a;
}

/** Ask the server to record the Checkout session now (/api/checkout/confirm)
 *  rather than wait for the webhook. Any failure is fine: the poll that
 *  follows still waits for the webhook. */
async function confirmCheckout(sessionId: string): Promise<void> {
  try {
    await fetch('/api/checkout/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
  } catch { /* unreachable — fall back to the webhook */ }
}

/** After an upgrade return: confirm the session when its id is known, then
 *  poll /api/access until the tier is paid (or the poll runs out) and announce
 *  the last read. One poll at a time — every caller shares it. */
export function pollAccessAfterUpgrade(sessionId?: string): Promise<Access | null> {
  if (polling) return polling;
  polling = (async () => {
    if (sessionId) await confirmCheckout(sessionId);
    const until = Date.now() + POLL_FOR_MS;
    let last: Access | null = null;
    for (;;) {
      last = (await readAccess()) ?? last;
      if (last && isPaidTier(last.tier)) break;
      if (Date.now() + POLL_EVERY_MS > until) break;
      await sleep(POLL_EVERY_MS);
    }
    if (last) announceAccess(last);
    return last;
  })().finally(() => { polling = null; });
  return polling;
}

/** Call on mount of any screen Checkout can return to (the app layout does,
 *  so every return screen is covered): records the return, drops ?upgraded=1
 *  and ?session_id= from the address so a reload doesn't re-trigger it, then
 *  confirms the session and starts the poll. Only the first caller sees the
 *  parameters; later calls do nothing. */
export function noteUpgradeReturn(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (url.searchParams.get('upgraded') !== '1') return;
  try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* storage blocked */ }
  const sessionId = url.searchParams.get('session_id') ?? undefined;
  url.searchParams.delete('upgraded');
  url.searchParams.delete('session_id');
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  void pollAccessAfterUpgrade(sessionId);
}

/** Re-check access whenever the app comes back into view (tab switch, app
 *  reopened, a page restored from the back-forward cache). Returns the cleanup. */
export function watchAccessOnReturn(): () => void {
  const recheck = () => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - lastRecheck < RECHECK_MIN_MS) return;
    lastRecheck = Date.now();
    void (recentlyUpgraded() ? pollAccessAfterUpgrade() : refreshAccess());
  };
  const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) recheck(); };
  document.addEventListener('visibilitychange', recheck);
  window.addEventListener('pageshow', onPageShow);
  return () => {
    document.removeEventListener('visibilitychange', recheck);
    window.removeEventListener('pageshow', onPageShow);
  };
}

export function recentlyUpgraded(): boolean {
  try {
    const at = Number(sessionStorage.getItem(KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < WINDOW_MS;
  } catch {
    return false;
  }
}

/** Re-read /api/access until `ok(access)` is true (about 9 s at most). Returns
 *  the last access read, or null if it never answered. */
export async function waitForAccess(ok: (a: Access) => boolean, tries = 6, everyMs = 1500): Promise<Access | null> {
  let last: Access | null = null;
  for (let i = 0; i < tries; i++) {
    const a = await readAccess();
    if (a) {
      last = a;
      if (ok(a)) {
        if (a.tier !== lastTier) announceAccess(a);
        return a;
      }
    }
    await sleep(everyMs);
  }
  return last;
}
