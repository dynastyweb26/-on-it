-- ═══════════════════════════════════════════════════════════════
-- Recap story: the stored payload + "Later" on the in-app prompt.
--
--   1. recaps.payload (jsonb) — everything the full-screen recap story shows
--      (RECAP-SPEC.md §7; built by src/lib/recap/payload.ts in the daily
--      cron). Stored once when the period closes, so the numbers never shift
--      when the story is reopened. Insert-once: a cron re-run leaves an
--      existing snapshot untouched. payload_version says which shape it is
--      (1 today). Size-capped (16 KB; the worst case measured is < 4 KB) and
--      must be a JSON object. It holds client and store names (≤ 120 chars),
--      readable only by the owner (existing owner SELECT policy). Clients can
--      never write it: no INSERT privilege, and column UPDATE stays limited.
--   2. recaps.prompted_at — set when the owner taps "Later" on the
--      "Your week is ready" sheet; that recap's prompt never shows again.
--      Distinct from seen_at (= watched, clears the Books dot). Column-level
--      UPDATE to authenticated, like seen_at.
--
-- Depends on 20261001000010_recaps.sql (public.recaps). Sorts after it and
-- after the paywall's 20261001000001–000003, touching none of their objects.
-- Idempotent: add-column-if-not-exists, drop-then-add constraint, grants.
-- Verify after applying: npm run db:privcheck — section P (P3 expects
-- prompted_at,seen_at once this version is recorded; P6 checks the columns
-- and the payload constraint).
-- ═══════════════════════════════════════════════════════════════

-- 1 ── payload ───────────────────────────────────────────────────
alter table public.recaps
  add column if not exists payload jsonb,
  add column if not exists payload_version smallint,
  add column if not exists prompted_at timestamptz;

alter table public.recaps drop constraint if exists recaps_payload_chk;
alter table public.recaps add constraint recaps_payload_chk check (
  payload is null
  or (jsonb_typeof(payload) = 'object'
      and octet_length(payload::text) <= 16384
      and payload_version is not null
      and payload_version between 1 and 100)
);

-- 2 ── prompted_at: the only new client-writable column ──────────
-- (seen_at's grant is from 20261001000010; payload / payload_version get none.)
grant update (prompted_at) on public.recaps to authenticated;
