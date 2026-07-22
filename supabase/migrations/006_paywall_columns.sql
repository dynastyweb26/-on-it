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
--
-- Idempotent: add-column-if-not-exists (this is the fix for the drift that
-- 500'd the webhook — a plain add errored when the columns pre-existed), and a
-- DO-block guard on the CHECK so a replay/re-run doesn't collide.
-- ═══════════════════════════════════════════════════════════════

alter table public.profiles alter column access_tier set default 'free';

alter table public.profiles
  add column if not exists subscription_status text,
  add column if not exists stripe_customer_id text unique,   -- UNIQUE also indexes the webhook customer-id lookup
  add column if not exists current_period_end timestamptz,
  add column if not exists trial_ends_at timestamptz;

-- Legacy free sentinel → the new 'free' value, so hasAccess() sees one vocabulary.
update public.profiles set access_tier = 'free' where access_tier = 'standard';

-- After the normalize, existing rows are only 'free' or 'founder' — both allowed.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_access_tier_chk') then
    alter table public.profiles
      add constraint profiles_access_tier_chk
      check (access_tier in ('free','founder','trialing','active','past_due','canceled'));
  end if;
end $$;
