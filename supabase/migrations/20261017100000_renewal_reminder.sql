-- ═══════════════════════════════════════════════════════════════
-- Annual renewal reminder — per-user sent-state
-- ADDITIVE: one new nullable column; safe to push from a feature branch
-- (main ignores it). Needs the full dry run / SQL / yes / privilege check.
--
-- profiles.renewal_reminder_sent_at: when we last emailed this subscriber
-- their yearly "your subscription renews monthly" reminder. NULL = never.
-- Written only by the /api/renewal-reminders cron (service role). Privileged:
-- NOT in the 20260723130946 grant-back list, so `authenticated` cannot update it.
-- ═══════════════════════════════════════════════════════════════
alter table public.profiles
  add column if not exists renewal_reminder_sent_at timestamptz;
