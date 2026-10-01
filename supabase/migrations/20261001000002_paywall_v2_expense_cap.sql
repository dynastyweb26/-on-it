-- ═══════════════════════════════════════════════════════════════
-- Paywall v2, part 2: free expense cap (5), counted from the reset.
--
-- PUSH ON LAUNCH DAY ONLY, together with 20261001000001 (it uses that
-- migration's paywall_reset_at() and pin_created_at()). Live for every user
-- once pushed, whatever NEXT_PUBLIC_PAYWALL_ENABLED says.
--
--   1. free_expense_limit() → 5 (new).
--   2. enforce_free_expense_limit() + BEFORE INSERT trigger on expenses: the
--      mirror of the invoice cap. Counts every expense the user created since
--      paywall_reset_at(), soft-deleted ones included (deleting refunds
--      nothing). Unlimited: founder / trialing / active / past_due. Capped:
--      free, canceled, null, legacy. Raises hint PAYWALL_LIMIT_EXPENSE.
--   3. created_at is server-owned on expenses too: stamped now() on insert
--      by the cap trigger, pinned on update by pin_created_at(). Existing rows
--      are not modified.
--
-- The tier rules must match src/lib/access.ts exactly.
-- Rollback (limits → 1,000,000): supabase/rollbacks/paywall_v2_rollback.sql.
-- Verify after pushing: npm run db:privcheck (section N).
-- ═══════════════════════════════════════════════════════════════

-- 1 ── Limit ────────────────────────────────────────────────────
create or replace function public.free_expense_limit()
returns int
language sql
immutable
set search_path = ''
as $$ select 5 $$;

grant execute on function public.free_expense_limit() to anon, authenticated;

-- 2 ── Cap trigger ──────────────────────────────────────────────
create or replace function public.enforce_free_expense_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tier  text;
  v_count int;
begin
  -- created_at is server-owned (header §3): never trust a client value.
  NEW.created_at := now();

  select p.access_tier into v_tier
    from public.profiles p
    where p.id = NEW.user_id;

  if v_tier in ('founder', 'trialing', 'active', 'past_due') then
    return NEW;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('expense_cap:' || NEW.user_id::text, 0));

  select count(*) into v_count
    from public.expenses e
    where e.user_id = NEW.user_id
      and e.created_at >= public.paywall_reset_at();

  if v_count >= public.free_expense_limit() then
    raise exception 'Free expense limit reached'
      using errcode = 'P0001', hint = 'PAYWALL_LIMIT_EXPENSE';
  end if;
  return NEW;
end $$;

drop trigger if exists enforce_free_expense_limit on public.expenses;
create trigger enforce_free_expense_limit
  before insert on public.expenses
  for each row execute function public.enforce_free_expense_limit();

-- 3 ── created_at fixed after insert ────────────────────────────
drop trigger if exists pin_created_at on public.expenses;
create trigger pin_created_at
  before update on public.expenses
  for each row execute function public.pin_created_at();

revoke execute on function public.enforce_free_expense_limit() from public, anon, authenticated;
