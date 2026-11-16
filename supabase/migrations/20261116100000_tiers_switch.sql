-- ═══════════════════════════════════════════════════════════════
-- Tiers phase 2, item 1: the database switch and the ONE Plus predicate.
--
-- tiers_enforced() is the SQL kill switch, the same shape as
-- free_invoice_limit(): an immutable constant read by every gate below. It
-- returns false today, so each gate that asks it is byte-for-byte today's
-- behaviour, and turning the gates on later is one migration that re-creates
-- this function returning true.
--
-- is_plus(uuid) is the only server-side definition of Plus: a founder, or a
-- paid tier whose plan is 'plus'. Never the plan alone (a canceled profile
-- keeps its plan value but has no access). It must agree with
-- entitlementsFor() in src/lib/entitlements.ts; src/lib/tiers-sql.test.ts
-- reads the two rules out of this file and proves the agreement for every
-- tier x plan pair.
--
-- Depends on profiles.plan from 20261116090000 (tiers phase 1).
-- Additive: two new functions, nothing replaced. Idempotent.
-- ═══════════════════════════════════════════════════════════════

-- 1 ── The switch ─────────────────────────────────────────────────
create or replace function public.tiers_enforced()
returns boolean
language sql
immutable
set search_path = ''
as $$ select false $$;

-- Constants follow the free_*_limit() pattern: readable by a signed-in user
-- through rpc, never by anon.
revoke execute on function public.tiers_enforced() from public, anon;
grant execute on function public.tiers_enforced() to authenticated;

-- 2 ── Plus ──────────────────────────────────────────────────────
-- Trigger functions run as the table owner and call this directly; no client
-- role needs EXECUTE, so a browser can't probe another user's plan.
create or replace function public.is_plus(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.profiles p
     where p.id = p_user
       and (
         p.access_tier = 'founder'
         or (p.access_tier in ('trialing', 'active', 'past_due') and p.plan = 'plus')
       )
  )
$$;

revoke execute on function public.is_plus(uuid) from public, anon, authenticated;
