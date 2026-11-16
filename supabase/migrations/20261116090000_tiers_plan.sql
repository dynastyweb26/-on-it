-- ═══════════════════════════════════════════════════════════════
-- Tiers, phase 1 (TIERS-SPEC.md): profiles.plan, the paid plan a profile is
-- on. Nothing reads it for a gate yet — access_tier still decides access.
--
-- Additive: one new nullable text column, a CHECK on that new column only,
-- and the backfill below. No existing column changes, so this may be pushed
-- from a feature branch (CLAUDE.md "Database migrations").
--
-- plan is privileged: only the Stripe webhook / subscription sync writes it,
-- on the service role. Users get no UPDATE and no INSERT on it (the same
-- treatment as access_tier); privilege check B lists it, BI1-BI2 assert the
-- column and the grant.
--
-- Backfill: founder = plus; a live subscription (trialing, active, past_due)
-- = pro, which is the only paid plan Stripe sells today. Everything else
-- stays null (free). Canceled rows are left as they are on purpose: a
-- canceled user keeps the plan they had, and access_tier decides that they
-- are on the free limits until they resubscribe.
--
-- Idempotent. The on-disk migration is the only source of truth; nothing
-- applies it automatically.
-- ═══════════════════════════════════════════════════════════════

-- 1 ── profiles.plan ──────────────────────────────────────────────
alter table public.profiles
  add column if not exists plan text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_plan_chk' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_plan_chk
      check (plan is null or plan in ('pro', 'plus'));
  end if;
end $$;

-- Clients never write it. profiles has no table-level UPDATE / INSERT for
-- anon or authenticated (20260723130946), so a new column starts unwritable;
-- this keeps it true if a stray table-level grant ever lands.
revoke update (plan) on public.profiles from anon, authenticated;
revoke insert (plan) on public.profiles from anon, authenticated;

-- 2 ── Backfill from access_tier ─────────────────────────────────
-- Founder codes outrank billing: a founder is always plus.
update public.profiles
  set plan = 'plus'
  where access_tier = 'founder'
    and plan is distinct from 'plus';

-- A live subscription is pro (trialing, active and the dunning grace window).
-- `plan is distinct from 'pro'` keeps a second run from touching anything.
update public.profiles
  set plan = 'pro'
  where access_tier in ('trialing', 'active', 'past_due')
    and plan is distinct from 'pro';
