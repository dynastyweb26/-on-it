-- ═══════════════════════════════════════════════════════════════
-- Tiers phase 5a: RevenueCat on the server (REVENUECAT-PLAN.md sections 2-4).
--
-- Additive: three nullable profiles columns (checks on themselves only), one
-- new table, and a backfill of existing Stripe subscribers.
--
-- billing_source is WHO may write the billing fields of a profile: 'stripe' for
-- a web subscription, 'app_store' / 'play_store' for a store one. The API and
-- the RevenueCat webhook write it in the same UPDATE as the tier and plan, so
-- the ownership rule is atomic (src/lib/billing-source.ts).
--
-- plan_change_to / plan_change_at record a store downgrade waiting for renewal
-- ("Plus until Dec 15, then Pro"). Cleared when it lands or is undone.
--
-- All three are privileged: no client UPDATE and no INSERT, the same treatment
-- as access_tier and plan. Only the service-role webhooks / sync write them.
--
-- revenuecat_events makes the webhook idempotent: the event row is inserted
-- first and processed_at is set only after the profile write succeeds, so a
-- failed attempt is retried by RevenueCat and a replay changes nothing. RLS on
-- with zero policies and no table privileges: no client ever reads it.
--
-- Backfill: an existing live Stripe subscriber is owned by Stripe. Canceled
-- rows are left null on purpose (nothing to protect, and the next event claims
-- them).
--
-- Idempotent. Depends on profiles.plan from 20261116090000.
-- ═══════════════════════════════════════════════════════════════

-- 1 ── profiles: who owns the billing, and a pending change ──────
alter table public.profiles
  add column if not exists billing_source text,
  add column if not exists plan_change_to text,
  add column if not exists plan_change_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_billing_source_chk' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_billing_source_chk
      check (billing_source is null or billing_source in ('stripe', 'app_store', 'play_store'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_plan_change_to_chk' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_plan_change_to_chk
      check (plan_change_to is null or plan_change_to in ('pro', 'plus'));
  end if;
  -- A scheduled change is a pair: neither half means anything alone.
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_plan_change_pair_chk' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_plan_change_pair_chk
      check ((plan_change_to is null) = (plan_change_at is null));
  end if;
end $$;

-- Clients never write them (profiles has no table-level UPDATE / INSERT for
-- anon or authenticated since 20260723130946; this keeps it true after any
-- stray table-level grant).
revoke update (billing_source, plan_change_to, plan_change_at)
  on public.profiles from anon, authenticated;
revoke insert (billing_source, plan_change_to, plan_change_at)
  on public.profiles from anon, authenticated;

-- 2 ── Backfill: a live Stripe subscription is Stripe's ──────────
update public.profiles
  set billing_source = 'stripe'
  where billing_source is null
    and stripe_customer_id is not null
    and access_tier in ('trialing', 'active', 'past_due');

-- 3 ── RevenueCat webhook idempotency ────────────────────────────
create table if not exists public.revenuecat_events (
  event_id     text primary key,
  type         text not null,
  app_user_id  text not null,
  environment  text not null check (environment in ('SANDBOX', 'PRODUCTION')),
  received_at  timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.revenuecat_events enable row level security;

-- No policies: nothing but the service role (which bypasses RLS) ever touches
-- this table. No privileges for the client roles either.
revoke all on table public.revenuecat_events from anon, authenticated;
