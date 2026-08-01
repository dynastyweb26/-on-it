-- ═══════════════════════════════════════════════════════════════
-- Trial-ending reminder — per-user sent-state tracking
-- Run in Supabase SQL Editor (project: bitfmmffnigxjjyxoxfr).
--
-- Adds profiles.trial_reminder_sent_at: the moment we emailed this user their
-- "trial ends in 3 days" heads-up. NULL = not yet sent. The daily cron
-- (/api/trial-reminders) claims a row by stamping this column BEFORE sending,
-- so a user can never be emailed twice even if the cron overlaps or reruns.
--
-- Privileged column — NOT user-writable. The blanket UPDATE grant was already
-- revoked in 20260723130946_revoke_profile_privileged_columns.sql, which grants
-- UPDATE back on ONLY an explicit allow-list of user-editable columns. A newly
-- added column is therefore non-updatable by `authenticated` by default, which
-- is exactly what we want: only the cron's service-role client writes it (the
-- service role bypasses column grants). Do NOT add it to that grant-back list.
--
-- Idempotent: add-column-if-not-exists.
-- ═══════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists trial_reminder_sent_at timestamptz;

-- Partial index: the cron scans for trialing users not yet reminded. Keeping
-- only the un-sent rows makes it a small, cheap index to probe each day.
create index if not exists profiles_trial_reminder_due_idx
  on public.profiles (trial_ends_at)
  where trial_reminder_sent_at is null;
