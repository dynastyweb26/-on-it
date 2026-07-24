-- ═══════════════════════════════════════════════════════════════
-- P0-3 — enforce the free invoice cap SERVER-SIDE.
--
-- The 2-invoice free cap was client-only: hasAccess() gates the paywall modal,
-- but invoices are inserted directly from the browser under RLS. RLS enforces
-- OWNERSHIP (auth.uid() = user_id), never tier or count — so a user could POST
-- to /rest/v1/invoices directly, or tap "convert quote to invoice" (a second
-- insert path with no gate at all), and sail past the cap.
--
-- Fix: a BEFORE INSERT trigger, SECURITY DEFINER, that rejects an over-cap
-- insert regardless of WHICH client path (or raw REST call) made it — now or
-- later. It reads the tier from the DB, so it can't be spoofed from the client.
--
-- Tier rules mirror hasAccess() EXACTLY (the two must never disagree):
--   founder / trialing / active / past_due → unlimited
--     (past_due is the Stripe dunning grace window; the webhook collapses it to
--      'canceled' once retries are exhausted — see tierFromStatus)
--   free / canceled / legacy / null        → capped at free_invoice_limit()
--   quotes (kind='quote')                  → never counted, never capped
--
-- The limit lives in ONE place: public.free_invoice_limit(). The trigger reads
-- it here; hasAccess() reads it via rpc. No literal duplicated across the
-- TS/SQL boundary.
--
-- The rejection carries hint='PAYWALL_LIMIT' so the client can tell this apart
-- from a real failure and surface the paywall modal, not "Something glitched".
--
-- Idempotent: create-or-replace functions, drop-then-create trigger.
-- ═══════════════════════════════════════════════════════════════

-- ── Single source of truth for the free-tier cap ─────────────
create or replace function public.free_invoice_limit()
returns int
language sql
immutable
set search_path = public
as $$ select 2 $$;

-- Read by hasAccess() (session client) via rpc. SECURITY DEFINER not needed —
-- it returns a constant and touches no tables.
grant execute on function public.free_invoice_limit() to anon, authenticated;

-- ── The enforcement trigger ──────────────────────────────────
create or replace function public.enforce_free_invoice_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier  text;
  v_count int;
  v_limit int := public.free_invoice_limit();
begin
  -- Quotes are never capped — matches hasAccess() counting kind='invoice' only.
  if NEW.kind is distinct from 'invoice' then
    return NEW;
  end if;

  -- Tier is read from the DB for NEW.user_id, never from client input, so it
  -- cannot be spoofed. (RLS WITH CHECK already pins NEW.user_id = auth.uid()
  -- for session inserts.)
  select access_tier into v_tier
    from public.profiles
    where id = NEW.user_id;

  -- Unlimited tiers pass straight through.
  if v_tier in ('founder', 'trialing', 'active', 'past_due') then
    return NEW;
  end if;

  -- free / canceled / legacy / null → count existing invoices and enforce.
  select count(*) into v_count
    from public.invoices
    where user_id = NEW.user_id and kind = 'invoice';

  if v_count >= v_limit then
    -- errcode P0001 = raise_exception; the hint is the signal the client keys
    -- on to open the paywall modal instead of showing a generic error.
    raise exception 'Free invoice limit reached'
      using errcode = 'P0001', hint = 'PAYWALL_LIMIT';
  end if;

  return NEW;
end $$;

drop trigger if exists enforce_free_invoice_limit on public.invoices;
create trigger enforce_free_invoice_limit
  before insert on public.invoices
  for each row execute function public.enforce_free_invoice_limit();
