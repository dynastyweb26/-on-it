// ═══ POST /api/plaid/accounts — one request may move several toggles ═══
// The route reads every account the body names in one query, then asks this
// module two things: did any id fall outside the caller's item (all-or-nothing),
// and does any change need the backfill (false → true). Pure: no Supabase.
import { needsBackfill } from './account-tracking';

/** The batch body's ceiling: a screen never sends more than a bank's accounts. */
export const MAX_TRACK_CHANGES = 50;

export type TrackChange = { account_id: string; track: boolean };

/** The row as the route reads it: id plus the previous flag. */
export type AccountState = { id: string; track: boolean | null };

/**
 * Ids in the body that the caller does not own. Any one of them refuses the
 * whole request before a write, so a request can never half-apply.
 */
export function unknownAccountIds(known: AccountState[], changes: TrackChange[]): string[] {
  const ids = new Set(known.map((row) => row.id));
  return changes.map((change) => change.account_id).filter((id) => !ids.has(id));
}

/**
 * True when at least one change is off → on. That is the only transition that
 * replays the window, so the route resets the cursor and syncs once at most.
 */
export function backfillWanted(known: AccountState[], changes: TrackChange[]): boolean {
  const previous = new Map(known.map((row) => [row.id, row.track === true]));
  return changes.some((change) => needsBackfill(previous.get(change.account_id) === true, change.track));
}

/** One UPDATE per distinct target value instead of one per account. */
export function trackGroups(changes: TrackChange[]): { track: boolean; ids: string[] }[] {
  return [true, false]
    .map((track) => ({
      track,
      ids: changes.filter((change) => change.track === track).map((change) => change.account_id),
    }))
    .filter((group) => group.ids.length > 0);
}
