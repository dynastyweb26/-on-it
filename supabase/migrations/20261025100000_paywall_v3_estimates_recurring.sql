-- ======================================================================
-- Paywall v3: free estimate cap (3) + paid-only recurring expenses.
--
-- Builds on paywall v2 (20261001000001 / 000002). Preview and production
-- share one database, so this is live for every user the moment it is
-- pushed, whatever NEXT_PUBLIC_PAYWALL_ENABLED says. Estimate work is tested
-- on the Supabase test project first (CLAUDE.md "Estimates pass").
--
--   1. estimate_reset_at(): a constant equal to the moment THIS migration
--      runs (the transaction's now(), written into the body), the same way
--      paywall_reset_at() works. Only quotes created at/after it count, so
--      every free user starts at 0 estimates. Nothing is deleted or
--      grandfathered: older quotes stay and just don't count.
--   2. free_estimate_limit() -> 3.
--   3. enforce_free_invoice_limit() is extended: quotes (kind = 'quote', the
--      estimates) are now capped too. Invoices keep paywall_reset_at() /
--      free_invoice_limit() and the hint PAYWALL_LIMIT; estimates count from
--      estimate_reset_at() against free_estimate_limit() and raise
--      PAYWALL_LIMIT_ESTIMATE. Both checks run under the same advisory lock
--      ('invoice_cap:<user>'), so concurrent inserts can't slip under either
--      cap. Soft-deleted rows count (deleting refunds nothing).
--   4. enforce_paid_recurring_expenses() + BEFORE INSERT trigger on
--      recurring_expenses: free and canceled users cannot create a recurring
--      item (hint PAYWALL_RECURRING). INSERT only, so recurring rows that
--      already exist survive a lapse and keep running under the expense cap.
--
-- The tier rules must match src/lib/access.ts exactly. Unlimited:
-- founder / trialing / active / past_due. Capped: free, canceled, null, legacy.
-- Privileges: the two trigger functions are SECURITY DEFINER, search_path = ''
-- and not executable by anon or authenticated. The two constants follow the
-- v2 pattern (invoker, immutable, read by access.ts through rpc): executable
-- by authenticated, not by anon.
-- Verify after pushing: npm run db:privcheck (section BA).
-- ======================================================================

-- 1 -- Estimate reset moment = push moment ------------------------------
do $$
begin
  execute format(
    'create or replace function public.estimate_reset_at() returns timestamptz '
    'language sql immutable set search_path = '''' as $f$ select %L::timestamptz $f$',
    now());
end $$;

revoke execute on function public.estimate_reset_at() from public, anon;
grant execute on function public.estimate_reset_at() to authenticated;

-- 2 -- Limit ------------------------------------------------------------
create or replace function public.free_estimate_limit()
returns int
language sql
immutable
set search_path = ''
as $$ select 3 $$;

revoke execute on function public.free_estimate_limit() from public, anon;
grant execute on function public.free_estimate_limit() to authenticated;

-- 3 -- Cap trigger, extended to estimates -------------------------------
create or replace function public.enforce_free_invoice_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tier  text;
  v_count int;
begin
  -- created_at is server-owned: never trust a client value.
  NEW.created_at := now();

  -- Only invoices and quotes (estimates) are capped.
  if NEW.kind is distinct from 'invoice' and NEW.kind is distinct from 'quote' then
    return NEW;
  end if;

  -- Tier from the DB for NEW.user_id, never from client input.
  select p.access_tier into v_tier
    from public.profiles p
    where p.id = NEW.user_id;

  if v_tier in ('founder', 'trialing', 'active', 'past_due') then
    return NEW;
  end if;

  -- One capped insert at a time per user (invoices and estimates share the
  -- lock), so two concurrent inserts can't both count the same total.
  perform pg_advisory_xact_lock(hashtextextended('invoice_cap:' || NEW.user_id::text, 0));

  if NEW.kind = 'invoice' then
    select count(*) into v_count
      from public.invoices i
      where i.user_id = NEW.user_id
        and i.kind = 'invoice'
        and i.created_at >= public.paywall_reset_at();

    if v_count >= public.free_invoice_limit() then
      -- The hint is what the client keys on to open the paywall.
      raise exception 'Free invoice limit reached'
        using errcode = 'P0001', hint = 'PAYWALL_LIMIT';
    end if;
  else
    select count(*) into v_count
      from public.invoices i
      where i.user_id = NEW.user_id
        and i.kind = 'quote'
        and i.created_at >= public.estimate_reset_at();

    if v_count >= public.free_estimate_limit() then
      raise exception 'Free estimate limit reached'
        using errcode = 'P0001', hint = 'PAYWALL_LIMIT_ESTIMATE';
    end if;
  end if;
  return NEW;
end $$;

drop trigger if exists enforce_free_invoice_limit on public.invoices;
create trigger enforce_free_invoice_limit
  before insert on public.invoices
  for each row execute function public.enforce_free_invoice_limit();

revoke execute on function public.enforce_free_invoice_limit() from public, anon, authenticated;

-- 4 -- Recurring expenses are a paid feature ---------------------------
create or replace function public.enforce_paid_recurring_expenses()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tier text;
begin
  select p.access_tier into v_tier
    from public.profiles p
    where p.id = NEW.user_id;

  if v_tier in ('founder', 'trialing', 'active', 'past_due') then
    return NEW;
  end if;

  raise exception 'Recurring expenses are part of On It'
    using errcode = 'P0001', hint = 'PAYWALL_RECURRING';
end $$;

drop trigger if exists enforce_paid_recurring_expenses on public.recurring_expenses;
create trigger enforce_paid_recurring_expenses
  before insert on public.recurring_expenses
  for each row execute function public.enforce_paid_recurring_expenses();

revoke execute on function public.enforce_paid_recurring_expenses() from public, anon, authenticated;
