-- ═══════════════════════════════════════════════════════════════
-- Push phase 2: "Ben's $250 invoice is still a draft — tap to send."
--
--   1. profiles.timezone — IANA zone name (e.g. America/Chicago), captured
--      from the browser. Used for quiet hours (no nudge 21:00–08:00 local);
--      a null or unrecognised zone means no draft nudge at all.
--   2. profiles.notify_draft_nudges — the Settings sub-toggle
--      "Remind me about unsent drafts". Default on.
--      Both are user preferences: SAFE columns, UPDATE granted to
--      authenticated (Settings writes them). Not insertable — onboarding's
--      insert list is unchanged, so defaults apply.
--   3. notification_log.event_type gains 'draft_unsent'. Dedupe keys:
--      'draft:<invoice_id>' (one nudge per draft, ever); the one-per-user-
--      per-20h cap reads notification_log by (user_id, created_at), which the
--      existing notification_log_user_idx already covers.
--   4. A partial index for the daily /api/draft-nudges scan. Invoices only:
--      quote drafts are never nudged. The index predicate alone doesn't
--      enforce that, so the route's query MUST also filter kind = 'invoice'
--      (which is also what lets the planner use this partial index).
--
-- Idempotent: add-column-if-not-exists, drop-then-add, if-not-exists index.
-- Verify after applying: supabase/snippets/privilege_check.sql section B
-- (both columns: privileged false, can_update true, can_insert false) and L.
-- ═══════════════════════════════════════════════════════════════

-- 1 + 2 ── profiles columns ─────────────────────────────────────
alter table public.profiles
  add column if not exists timezone text,
  add column if not exists notify_draft_nudges boolean not null default true;

alter table public.profiles drop constraint if exists profiles_timezone_chk;
alter table public.profiles add constraint profiles_timezone_chk
  check (timezone is null
         or (char_length(timezone) <= 64 and timezone ~ '^[A-Za-z0-9_+/-]+$'));

-- Column-level only: 20260925000001 keeps profiles at no table-level writes.
grant update (timezone, notify_draft_nudges) on public.profiles to authenticated;

-- 3 ── notification_log: allow the new event type ───────────────
-- Full list, superseding 20260930000003's (which added invoice_viewed).
alter table public.notification_log drop constraint if exists notification_log_type_chk;
alter table public.notification_log add constraint notification_log_type_chk
  check (event_type in ('payment_received', 'connect_problem', 'invoice_viewed', 'draft_unsent', 'test'));

-- 4 ── scan index ───────────────────────────────────────────────
create index if not exists invoices_unsent_drafts_idx
  on public.invoices (updated_at)
  where status = 'draft' and kind = 'invoice' and deleted_at is null and first_sent_at is null;
