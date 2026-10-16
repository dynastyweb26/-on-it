/* ═══ Sign-in throb — the "How On It works" pill glows after sign-in ═══
   Login sets a sessionStorage flag on each successful sign-in. The first app
   screen to read it starts a 10s clock (stored, so a refresh mid-pulse only
   finishes the remaining time — it never restarts); after that, or once the
   pill is tapped, the flag is "done" for the rest of the browser session.
   A new sign-in sets it again. */
const KEY = 'onit-help-throb';
export const THROB_MS = 10_000;

/** Call on a successful sign-in. */
export function markSignInThrob() {
  try { sessionStorage.setItem(KEY, 'pending'); } catch { /* storage blocked — no pulse */ }
}

/** Milliseconds of pulse left (0 = none). Starts the clock on first read. */
export function throbRemaining(): number {
  try {
    const v = sessionStorage.getItem(KEY);
    if (v === 'pending') {
      sessionStorage.setItem(KEY, String(Date.now()));
      return THROB_MS;
    }
    const started = Number(v);
    if (!v || !Number.isFinite(started)) return 0;
    return Math.max(0, THROB_MS - (Date.now() - started));
  } catch {
    return 0;
  }
}

/** Stop for good (timer ran out, or the pill was tapped). */
export function stopThrob() {
  try { sessionStorage.setItem(KEY, 'done'); } catch { /* ignore */ }
}
