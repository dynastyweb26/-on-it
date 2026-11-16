-- ═══════════════════════════════════════════════════════════════
-- Tiers phase 2, item 4: new recurring expenses need Plus — CHANGING
-- (create-or-replace of an existing trigger function, so this may not be
-- pushed from a feature branch; CLAUDE.md "Database migrations").
--
-- tiers_enforced() false → exactly the v3 body (20261025100000): a paid tier
-- may create one, everyone else gets PAYWALL_RECURRING. Nothing else moves.
-- tiers_enforced() true → is_plus() decides. A founder and a Plus subscriber
-- pass; Pro gets its own hint (PLAN_RECURRING) so the client can offer the
-- upgrade instead of the paywall; free and canceled keep PAYWALL_RECURRING.
--
-- Still BEFORE INSERT only: existing items keep running, and pause, skip,
-- delete, restore and the cron's updates are untouched.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.enforce_paid_recurring_expenses()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tier text;
begin
  -- Switch off: today's logic, unchanged.
  if not public.tiers_enforced() then
    select p.access_tier into v_tier
      from public.profiles p
      where p.id = NEW.user_id;

    if v_tier in ('founder', 'trialing', 'active', 'past_due') then
      return NEW;
    end if;

    raise exception 'Recurring expenses are part of On It'
      using errcode = 'P0001', hint = 'PAYWALL_RECURRING';
  end if;

  if public.is_plus(NEW.user_id) then
    return NEW;
  end if;

  -- Pro: a real subscriber who needs the higher plan, not the paywall.
  select p.access_tier into v_tier
    from public.profiles p
    where p.id = NEW.user_id;

  if v_tier in ('trialing', 'active', 'past_due') then
    raise exception 'Recurring expenses need the Plus plan'
      using errcode = 'P0001', hint = 'PLAN_RECURRING';
  end if;

  raise exception 'Recurring expenses are part of On It'
    using errcode = 'P0001', hint = 'PAYWALL_RECURRING';
end $$;

-- Trigger + grants are unchanged from 20261025100000; re-asserted so this
-- file leaves the same state whatever order migrations land in.
drop trigger if exists enforce_paid_recurring_expenses on public.recurring_expenses;
create trigger enforce_paid_recurring_expenses
  before insert on public.recurring_expenses
  for each row execute function public.enforce_paid_recurring_expenses();

revoke execute on function public.enforce_paid_recurring_expenses() from public, anon, authenticated;
