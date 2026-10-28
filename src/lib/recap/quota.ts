// ═══ Free recaps: the first 2 WEEKLY recaps ═══
// The product rule: the free plan gets the first two weekly recaps, then they
// are paid-only. Monthly recaps are paid-only from the start and never take a
// slot. The allowance is spent when a recap is BUILT (the Monday cron), never
// when it is watched — so a recap is either born entitled or born locked, and
// nobody can be cut off mid-story.
//
// The two columns that carry this live on public.recaps (migration
// 20261027000000_recaps_free_slots.sql):
//   free_plan  true   → this row was built while the owner was on the free plan
//              false  → built while paid (or before the rule existed): always
//                       playable, so a downgrade never rewrites history
//   free_slot  1 or 2 → this row owns one of the two free recaps
//              null   → no slot: a quiet period, a locked row past the cap, or
//                       a paid-built row (free_plan false)
//
// Everything here is pure and unit-tested: the cron (lib/notify/recaps) and the
// app (RecapProvider, RecapsCard, /recaps) both read these helpers, so the rule
// cannot drift between the writer and the reader.
import type { RecapKind } from './dates';

/** The free plan's recap allowance: weekly recaps, counted at build time. */
export const FREE_RECAPS = 2;

export type RecapQuotaRow = {
  kind: RecapKind;
  free_plan?: boolean | null;
  free_slot?: number | null;
};

/** A slot number that entitles a free-plan row (1..FREE_RECAPS). */
export const isEntitledSlot = (slot: number | null | undefined): boolean =>
  typeof slot === 'number' && Number.isInteger(slot) && slot >= 1 && slot <= FREE_RECAPS;

/**
 * Can this recap be played? A paid owner plays everything. On the free plan,
 * rows built while paid are still playable ("your history stays") and a
 * free-plan row needs one of the two slots. The owner's plan, not the row's,
 * decides first: upgrading unlocks the rows that were born locked, and nothing
 * has to be rewritten when the tier changes.
 */
export function recapUnlocked(row: RecapQuotaRow, freePlan: boolean): boolean {
  if (!freePlan) return true;
  if (!row.free_plan) return true;
  return isEntitledSlot(row.free_slot);
}

/** Slots this owner has spent: entitled free-plan rows, however many there are. */
export function freeRecapsUsed(rows: readonly RecapQuotaRow[]): number {
  let n = 0;
  for (const r of rows) if (r.free_plan && isEntitledSlot(r.free_slot)) n++;
  return n;
}

/** Free recaps still coming (never negative). */
export function freeRecapsLeft(rows: readonly RecapQuotaRow[]): number {
  return Math.max(0, FREE_RECAPS - freeRecapsUsed(rows));
}

/**
 * The slot the recap being built should take, or null for no slot.
 * - paid owner                → null (free_plan is false; the row always plays)
 * - monthly recap             → null (paid-only, free owners get no row at all)
 * - quiet period (no activity)→ null, so an empty week never spends a slot
 * - allowance already spent   → null and `free_plan` is still stored, which is
 *                               how the row is known to be locked
 */
export function nextFreeSlot(input: {
  kind: RecapKind;
  announce: boolean;
  freePlan: boolean;
  used: number;
}): number | null {
  if (!input.freePlan) return null;
  if (input.kind !== 'week') return null;
  if (!input.announce) return null;
  if (input.used >= FREE_RECAPS) return null;
  return input.used + 1;
}
