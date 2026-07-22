-- ═══════════════════════════════════════════════════════════════
-- 007 — add the missing profiles.trial_ends_at column
-- Run in Supabase SQL Editor (project: bitfmmffnigxjjyxoxfr).
--
-- Root cause of the Stripe webhook 500s: the paywall columns on the live DB
-- came from a PARTIAL earlier scaffold run that added only stripe_customer_id,
-- subscription_status, and current_period_end. 006 (which would have added
-- trial_ends_at) never fully applied because those three already existed. The
-- webhook's profiles UPDATE writes trial_ends_at, so PostgREST rejects the
-- whole statement (PGRST204 "column not found") and the handler 500s —
-- leaving access_tier stuck at 'free'.
--
-- Idempotent: safe to run even if the column somehow already exists.
-- ═══════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists trial_ends_at timestamptz;
