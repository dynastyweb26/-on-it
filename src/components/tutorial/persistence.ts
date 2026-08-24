/* ═══ Tutorial persistence — first-run gating only ═══
   The last-seen version lives here so the FIRST-RUN carousel can gate itself:
   a user behind TUTORIAL_VERSION sees it once, then never again until the
   version is bumped. The reference doc (the "How On It works" pill) does NOT
   use any of this — it is always available and must never read or write a
   seen-version. Keeping the persistence out of the presentational components
   is what makes the reference doc session-free (it opens clean for a guest). */

/* Bump when the FIRST-RUN walkthrough content changes — every user then sees
   it once more (their stored last-seen version falls behind this). */
export const TUTORIAL_VERSION = 1;

// ── Per-user last-seen persistence ──────────────────────────────
// Keyed by user id so it's genuinely per-user on the device, matching the
// codebase's other local flags (onit_reminder_prompted, chat store). Swap the
// body of these for a profiles column later without touching any component.
const seenKey = (userId: string) => `onit_tutorial_v:${userId}`;

export function getSeenVersion(userId: string): number {
  try {
    return Number(localStorage.getItem(seenKey(userId))) || 0;
  } catch {
    return 0;
  }
}

/** True when this user is behind the current first-run walkthrough (never seen
 *  it, or an older version). Drives the auto-show. */
export function shouldAutoShowTutorial(userId: string): boolean {
  return getSeenVersion(userId) < TUTORIAL_VERSION;
}

export function markTutorialSeen(userId: string) {
  try {
    localStorage.setItem(seenKey(userId), String(TUTORIAL_VERSION));
  } catch {
    /* storage full/blocked — worst case it shows again next load */
  }
}
