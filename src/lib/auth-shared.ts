// One getUser() per page load instead of five to twelve.
//
// supabase.auth.getUser() is a network round trip (GET /auth/v1/user), and the
// (app) layout, RecapProvider and the page each called it on mount. This wraps
// any getUser-shaped function so callers that start together (or within TTL_MS
// of each other) share ONE request and its answer. It is a drop-in: callers
// still get the exact `{ data: { user }, error }` result and keep their own
// redirect logic. Only a successful result with a user is remembered; a
// signed-out or failed answer is never reused, and clear() (called on every
// auth state change) forgets it at once. After TTL_MS the next call asks the
// server again, so a hung request can't be shared forever.

export const SHARED_USER_TTL_MS = 15_000;

export function createSharedGetUser<R extends { data: { user: unknown }; error: unknown }>(
  fetchUser: () => Promise<R>,
  now: () => number = Date.now,
  ttlMs: number = SHARED_USER_TTL_MS,
) {
  let entry: { at: number; promise: Promise<R> } | null = null;
  let generation = 0;

  function get(): Promise<R> {
    if (entry && now() - entry.at < ttlMs) return entry.promise;
    const gen = generation;
    const promise = fetchUser();
    const mine = { at: now(), promise };
    entry = mine;
    // Forget answers we must not reuse: failures, signed-out, and anything
    // that settled after clear() ran.
    const forget = () => { if (entry === mine) entry = null; };
    promise.then(
      (r) => { if (gen !== generation || r.error || !r.data?.user) forget(); },
      forget,
    );
    return promise;
  }

  function clear() { generation++; entry = null; }

  return { get, clear };
}
