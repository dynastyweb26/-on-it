-- ═══════════════════════════════════════════════════════════════
-- Free plan: the first 2 weekly recaps.
--
--   1. recaps.free_plan — true when this snapshot was built while the owner was
--      on the free plan (or canceled). false = built while paid, or built
--      before this rule existed; those rows always play, so a downgrade never
--      locks history someone already saw. Default false is the correct value
--      for every existing row: the recap cron has only ever built rows for
--      paid owners, so nothing needs a backfill.
--   2. recaps.free_slot — the free recap this row owns: 1 or 2. Null means "no
--      slot": a quiet period (no activity never spends an allowance), a row
--      past the cap (free_plan true + free_slot null = born locked), or a
--      paid-built row. Assigned once, by the cron, when the snapshot is
--      inserted — never on watch, so an already-built recap is never lost
--      mid-story.
--   3. Monthly recaps are paid-only: the cron builds none for a free owner, so
--      no slot is ever spent on a month.
--
-- The rule itself lives in src/lib/recap/quota.ts (FREE_RECAPS, nextFreeSlot,
-- recapUnlocked) and is unit-tested; the app reads it through the same module.
--
-- No RLS change and no new grant: both columns are read by the owner through
-- the existing table-level SELECT, and neither is client-writable — UPDATE on
-- public.recaps stays column-level on seen_at + prompted_at (P3 below still
-- expects exactly 'prompted_at,seen_at').
--
-- Additive only: two nullable-and-defaulted columns plus a check on the new
-- column, so it can be applied to a test project before the code merges.
-- Verify after applying: npm run db:privcheck — sections P3, P6 and P7.
-- ═══════════════════════════════════════════════════════════════

-- 1 ── the two columns ───────────────────────────────────────────
alter table public.recaps
  add column if not exists free_plan boolean not null default false,
  add column if not exists free_slot smallint;

-- A slot is only meaningful on a free-plan row, and only 1..2 exist.
alter table public.recaps drop constraint if exists recaps_free_slot_chk;
alter table public.recaps add constraint recaps_free_slot_chk
  check (
    free_slot is null or (free_plan and free_slot between 1 and 2)
  );

-- The cron's slot lookup: "which slots has this owner already spent".
create index if not exists recaps_free_slots_idx
  on public.recaps (user_id, free_slot)
  where free_slot is not null;

-- No grants: the owner reads both columns under the existing SELECT privilege,
-- and neither is updatable by a client.
revoke update (free_plan) on public.recaps from anon, authenticated;
revoke update (free_slot) on public.recaps from anon, authenticated;
