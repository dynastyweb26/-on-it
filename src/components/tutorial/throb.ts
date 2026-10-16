/* ═══ Sign-in throb — the "How On It works" pill glows after sign-in ═══
   Every successful sign-in sets a sessionStorage flag:
   • password sign-in / sign-up with a session — login page, markSignInThrob();
   • email confirmation link — /auth/confirm signs in on the SERVER, so the
     browser never sees SIGNED_IN; the route sets a short-lived marker cookie
     (SIGNED_IN_COOKIE) that consumeSignInCookie() turns into the flag;
   • any other client-side SIGNED_IN for a new user — (app)/layout.tsx. The first app
   screen to read it starts a 10s clock (stored, so a refresh mid-pulse only
   finishes the remaining time — it never restarts); after that, or once the
   pill is tapped, the flag is "done" for the rest of the browser session.
   A new sign-in sets it again. */
const KEY = 'onit-help-throb';
export const THROB_MS = 10_000;

/** UI-only marker cookie set by /auth/confirm on a successful sign-in. Not a
 *  credential: it only says "pulse the help pill once". */
export const SIGNED_IN_COOKIE = 'onit_signed_in';

/** If /auth/confirm just signed this browser in, start a throb (and clear the
 *  marker so it is used once). Returns true when it did. */
export function consumeSignInCookie(): boolean {
  try {
    if (!document.cookie.split('; ').includes(`${SIGNED_IN_COOKIE}=1`)) return false;
    document.cookie = `${SIGNED_IN_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
    markSignInThrob();
    return true;
  } catch {
    return false;
  }
}

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
