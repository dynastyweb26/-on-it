// ═══ Account tracking → backfill (pure) ═══
// While an account is untracked the sync skips every row of it, so flipping
// track to true has to replay the window from scratch: the item's cursor goes
// back to null and a sync runs. Every other transition (true → false, and a
// no-op) only moves the account flag.

/** True only on the false → true flip: the one transition that needs a replay. */
export function needsBackfill(previousTrack: boolean, nextTrack: boolean): boolean {
  return nextTrack && !previousTrack;
}
