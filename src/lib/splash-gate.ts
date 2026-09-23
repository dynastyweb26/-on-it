// Readiness gate between the splash and the screen underneath it.
//
// The app renders UNDER the splash from the first frame (layout.tsx: <Splash />
// is a sibling above {children}); this only decides WHEN the splash leaves. A
// screen with critical first-load work (chat: restore + auth/profile) calls
// holdSplash() on mount and releases once that work is done, so the splash
// exits onto real content instead of a half-loaded screen. Screens that never
// hold are "ready" as soon as they hydrate.
//
// Holds are advisory, never blocking: Splash.tsx caps the wait (2.5s after the
// reveal ends), so a slow network can't trap the user; the screen then shows
// its own skeleton.
let holds = 0;
const listeners = new Set<() => void>();

/** Keep the splash up until the returned release() is called (idempotent). */
export function holdSplash(): () => void {
  holds++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds--;
    if (holds === 0) listeners.forEach((fn) => fn());
  };
}

/** Calls fn once no holds are outstanding (now, if none). Returns an unsubscribe. */
export function whenAppReady(fn: () => void): () => void {
  if (holds === 0) {
    fn();
    return () => {};
  }
  const once = () => { listeners.delete(once); fn(); };
  listeners.add(once);
  return () => { listeners.delete(once); };
}
