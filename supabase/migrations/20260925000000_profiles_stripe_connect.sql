-- ═══════════════════════════════════════════════════════════════
-- Stripe Connect (Standard accounts, direct charges) — profiles columns.
--
-- A seller connects their OWN Stripe Standard account; clients pay them
-- directly (direct charges, no application fee). These columns record which
-- connected account belongs to the profile and whether Stripe says it can
-- take charges yet.
--
--   stripe_account_id         acct_… of the seller's connected account.
--                             Distinct from stripe_customer_id, which is the
--                             seller's customer on OUR platform account for
--                             the On It subscription.
--   stripe_charges_enabled    mirrored from Stripe's Account object
--   stripe_details_submitted  "
--   stripe_payouts_enabled    "
--   card_payments_enabled     the seller's own opt-in: show "Pay with card"
--                             on their invoices. Card payment is offered only
--                             when this AND stripe_charges_enabled are true
--                             (enforced where it's read, not by a CHECK — a
--                             CHECK would make Stripe's own charges_enabled
--                             downgrade fail to write).
--
-- Privilege model (matches 20260723130946): authenticated has NO table-level
-- UPDATE on profiles, only per-column grants. The four stripe_* columns are
-- deliberately NOT granted — only the server (service-role, /api/connect/*
-- and later the Connect webhook) writes them, so a user can't point their
-- profile at someone else's account or fake charges_enabled.
-- card_payments_enabled IS granted: it's a user preference, saved through
-- Settings' normal session-client save().
--
-- Idempotent: add-column-if-not-exists, guarded constraint, re-grant no-op.
-- ═══════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists stripe_account_id        text unique,
  add column if not exists stripe_charges_enabled   boolean not null default false,
  add column if not exists stripe_details_submitted boolean not null default false,
  add column if not exists stripe_payouts_enabled   boolean not null default false,
  add column if not exists card_payments_enabled    boolean not null default false;

-- Length/shape backstop (every text column has a CHECK cap).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_stripe_account_id_chk') then
    alter table public.profiles
      add constraint profiles_stripe_account_id_chk
      check (stripe_account_id is null
             or (stripe_account_id ~ '^acct_[A-Za-z0-9]+$' and char_length(stripe_account_id) <= 64));
  end if;
end $$;

-- User-editable preference only. The stripe_* columns stay ungranted.
grant update (card_payments_enabled) on public.profiles to authenticated;

-- Verification — run after applying.
--
-- 1. Columns present with the right types/defaults:
-- select column_name, data_type, column_default, is_nullable
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'profiles'
--   and column_name in ('stripe_account_id','stripe_charges_enabled',
--     'stripe_details_submitted','stripe_payouts_enabled','card_payments_enabled');
--
-- 2. authenticated can UPDATE card_payments_enabled but NOT the stripe_* columns
--    (expect: card_payments_enabled true, the other four false):
-- select c.column_name,
--        has_column_privilege('authenticated', 'public.profiles', c.column_name, 'UPDATE') as can_update
-- from information_schema.columns c
-- where c.table_schema = 'public' and c.table_name = 'profiles'
--   and c.column_name in ('stripe_account_id','stripe_charges_enabled',
--     'stripe_details_submitted','stripe_payouts_enabled','card_payments_enabled');
