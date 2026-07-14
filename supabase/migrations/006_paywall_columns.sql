-- ═══════════════════════════════════════════════════════════════
-- 006 — Paywall / Stripe subscription columns
-- Run in Supabase SQL Editor (project: bitfmmffnigxjjyxoxfr).
--
-- profiles.access_tier ALREADY EXISTS (002_access_grants.sql, default
-- 'standard'). Founders are access_tier='founder' (materialized by
-- redeem_grant()). So this migration does NOT re-add access_tier — it:
--   1. flips the free-tier default from the legacy 'standard' to 'free',
--   2. adds the Stripe subscription columns,
--   3. normalizes existing 'standard' rows to 'free',
--   4. adds a CHECK that ALLOWS founder (grants) + free + the four Stripe
--      lifecycle statuses this integration writes.
-- The UPDATE runs BEFORE the CHECK so no existing row violates the constraint.
-- ═══════════════════════════════════════════════════════════════

alter table public.profiles
  alter column access_tier set default 'free',
  add column subscription_status text,
  add column stripe_customer_id text unique,   -- UNIQUE also indexes the webhook customer-id lookup
  add column current_period_end timestamptz,
  add column trial_ends_at timestamptz;

-- Legacy free sentinel → the new 'free' value, so hasAccess() sees one vocabulary.
update public.profiles set access_tier = 'free' where access_tier = 'standard';

-- After the normalize, existing rows are only 'free' or 'founder' — both allowed.
alter table public.profiles
  add constraint profiles_access_tier_chk
  check (access_tier in ('free','founder','trialing','active','past_due','canceled'));
