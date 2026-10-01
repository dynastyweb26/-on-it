-- ═══════════════════════════════════════════════════════════════
-- Paywall v2, part 1: free invoice cap back on (3), counted from the reset.
--
-- PUSH ON LAUNCH DAY ONLY. Preview and production share this database and the
-- trigger doesn't know about NEXT_PUBLIC_PAYWALL_ENABLED: the cap is live for
-- every user the moment this is pushed.
--
--   1. paywall_reset_at() — a constant equal to the moment THIS migration runs
--      (the transaction's now(), written into the function body). Only rows
--      created at/after it count, so every free user starts at 0. No
--      grandfathering, nothing deleted: older rows stay and just don't count.
--   2. free_invoice_limit() → 3 (was the kill-switch value 1,000,000 from
--      20260823120000, which is left untouched).
--   3. enforce_free_invoice_limit(): counts kind='invoice' rows created since
--      the reset (soft-deleted ones included: deleting refunds nothing).
--      Unlimited: founder / trialing / active / past_due. Capped: free,
--      canceled, null, legacy.
--   4. created_at is server-owned on invoices: the cap trigger stamps now() on
--      insert, and pin_created_at() keeps it unchanged on update. Clients hold
--      INSERT/UPDATE on created_at, so without this a row could be backdated
--      before the reset and never count. Existing rows are not modified.
--
-- The tier rules must match src/lib/access.ts exactly.
-- Rollback (cap → 1,000,000): supabase/rollbacks/paywall_v2_rollback.sql.
-- Verify after pushing: npm run db:privcheck (section N).
-- ═══════════════════════════════════════════════════════════════

-- 1 ── Reset moment = push moment ───────────────────────────────
do $$
begin
  execute format(
    'create or replace function public.paywall_reset_at() returns timestamptz '
    'language sql immutable set search_path = '''' as $f$ select %L::timestamptz $f$',
    now());
end $$;

grant execute on function public.paywall_reset_at() to anon, authenticated;

-- 2 ── Limit ────────────────────────────────────────────────────
create or replace function public.free_invoice_limit()
returns int
language sql
immutable
set search_path = ''
as $$ select 3 $$;

grant execute on function public.free_invoice_limit() to anon, authenticated;

-- 3 ── Cap trigger ──────────────────────────────────────────────
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
  -- created_at is server-owned (header §4): never trust a client value.
  NEW.created_at := now();

  -- Quotes are never capped.
  if NEW.kind is distinct from 'invoice' then
    return NEW;
  end if;

  -- Tier from the DB for NEW.user_id, never from client input.
  select p.access_tier into v_tier
    from public.profiles p
    where p.id = NEW.user_id;

  if v_tier in ('founder', 'trialing', 'active', 'past_due') then
    return NEW;
  end if;

  -- One capped insert at a time per user, so two concurrent inserts can't
  -- both count the same total and slip under the cap.
  perform pg_advisory_xact_lock(hashtextextended('invoice_cap:' || NEW.user_id::text, 0));

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
  return NEW;
end $$;

drop trigger if exists enforce_free_invoice_limit on public.invoices;
create trigger enforce_free_invoice_limit
  before insert on public.invoices
  for each row execute function public.enforce_free_invoice_limit();

-- 4 ── created_at fixed after insert ────────────────────────────
-- Shared with expenses (part 2). Invoker: it only copies OLD into NEW.
create or replace function public.pin_created_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  NEW.created_at := OLD.created_at;
  return NEW;
end $$;

drop trigger if exists pin_created_at on public.invoices;
create trigger pin_created_at
  before update on public.invoices
  for each row execute function public.pin_created_at();

-- Trigger functions are never called directly.
revoke execute on function public.enforce_free_invoice_limit() from public, anon, authenticated;
revoke execute on function public.pin_created_at() from public, anon, authenticated;
