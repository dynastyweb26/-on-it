-- ═══════════════════════════════════════════════════════════════
-- 007 — profiles.trial_ends_at  (SUPERSEDED by 006, retained as tombstone)
--
-- History: on the live DB, the paywall columns came from a PARTIAL earlier
-- scaffold run that added only stripe_customer_id / subscription_status /
-- current_period_end. 006's plain `add column trial_ends_at` therefore errored
-- (the other columns already existed), so trial_ends_at never landed and the
-- Stripe webhook 500'd (PGRST204). 007 added it out-of-band.
--
-- Now that 006 uses `add column if not exists`, it is the authoritative home of
-- trial_ends_at and a clean replay creates the column there. This file is kept
-- (NOT deleted or renumbered) so environments that already recorded 007 in the
-- migration ledger keep a stable history; on a fresh replay it is a harmless
-- idempotent no-op.
-- ═══════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists trial_ends_at timestamptz;
