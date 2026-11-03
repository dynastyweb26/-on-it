-- ═══════════════════════════════════════════════════════════════
-- MONEY IN — bank deposits become evidence the owner can turn into a
-- payment. Additive only: two new tables, no change to bank_transactions,
-- invoice_payments or any existing constraint.
--
--   1. bank_deposits       one row per incoming bank transaction (Plaid's
--                          amount < 0). Stored as the absolute value, because
--                          bank_transactions keeps money-out positive and is
--                          not touched. pending → posted lands on the SAME row
--                          (plaid_transaction_id is rekeyed), so a deposit's
--                          links can never be lost or duplicated.
--   2. bank_deposit_links  what the owner decided about a deposit:
--                            recorded      a ledger row this flow wrote
--                            linked        an existing ledger row
--                            not_income    not new income
--                            stripe_payout a card payout (already counted)
--                          A deposit with no link is new; a link decides it; a
--                          link plus removed_at needs a look. There is no
--                          review_state machine for money in.
--
-- The ledger stays the single source of truth: invoice_payments is never
-- edited or reversed here. Deleting a ledger row cascades its link away, so
-- the deposit simply becomes undecided again.
--
-- Access model: owner-only SELECT via RLS, every write on the service role in
-- /api/plaid/deposits. No INSERT / UPDATE / DELETE policy and no such grant.
--
-- Idempotent. Verify after applying: npm run db:privcheck — section BD.
-- ═══════════════════════════════════════════════════════════════

-- 1 ── bank_deposits ────────────────────────────────────────────
create table if not exists public.bank_deposits (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles(id) on delete cascade,
  plaid_item_id         uuid not null references public.plaid_items(id) on delete cascade,
  account_id            uuid not null references public.plaid_accounts(id) on delete cascade,
  plaid_transaction_id  text not null
                          check (char_length(plaid_transaction_id) between 1 and 120),
  -- Plaid's pending id, kept so a pending → posted change is traceable.
  pending_transaction_id text
                          check (pending_transaction_id is null
                                 or char_length(pending_transaction_id) between 1 and 120),
  -- abs(Plaid amount): money in is negative at Plaid, positive here.
  amount                numeric(12,2) not null check (amount > 0),
  -- The posted date; a recorded payment is dated from it.
  occurred_on           date not null,
  name                  text not null check (char_length(name) between 1 and 300),
  merchant_name         text check (merchant_name is null or char_length(merchant_name) <= 200),
  pending               boolean not null default false,
  -- Set when Plaid removes the deposit. The links are kept; nothing else moves.
  removed_at            timestamptz,
  -- Descriptor detector, written by sync and re-applied server-side.
  is_stripe_payout      boolean not null default false,
  created_at            timestamptz not null default now(),
  -- Dedupe: one row per Plaid transaction id, per owner.
  constraint bank_deposits_txn_key unique (user_id, plaid_transaction_id)
);

create index if not exists bank_deposits_user_date_idx
  on public.bank_deposits (user_id, occurred_on desc);
create index if not exists bank_deposits_open_idx
  on public.bank_deposits (user_id) where removed_at is null;

-- 2 ── bank_deposit_links ───────────────────────────────────────
create table if not exists public.bank_deposit_links (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  deposit_id  uuid not null references public.bank_deposits(id) on delete cascade,
  -- Null for not_income / stripe_payout; required for recorded / linked.
  payment_id  uuid references public.invoice_payments(id) on delete cascade,
  kind        text not null
                check (kind in ('recorded', 'linked', 'not_income', 'stripe_payout')),
  -- Audit trail: who (user_id) and when, on every link.
  created_at  timestamptz not null default now(),
  -- A payment link and a non-income decision are mutually exclusive by shape.
  constraint bank_deposit_links_payment_chk
    check ((payment_id is not null) = (kind in ('recorded', 'linked')))
);

-- One ledger row belongs to at most one deposit. Many ledger rows per deposit
-- are allowed (partial payments).
create unique index if not exists bank_deposit_links_payment_uidx
  on public.bank_deposit_links (payment_id) where payment_id is not null;

-- A deposit is either income-linked or dismissed, never both.
create unique index if not exists bank_deposit_links_terminal_uidx
  on public.bank_deposit_links (deposit_id) where kind in ('not_income', 'stripe_payout');

create index if not exists bank_deposit_links_deposit_idx
  on public.bank_deposit_links (deposit_id);
create index if not exists bank_deposit_links_user_idx
  on public.bank_deposit_links (user_id);

-- 3 ── The link guard ───────────────────────────────────────────
-- A BEFORE INSERT/UPDATE trigger is the database backstop for the route:
--   • a ledger row can never be linked to a Stripe payout or a deposit already
--     marked not income (and vice versa);
--   • the linked ledger amounts can never exceed the deposit;
--   • only a plain manual payment can be linked: no Stripe row and no reversal;
--   • a link can never cross owners.
-- SECURITY DEFINER because the owner has no write grant; the lock on the
-- deposit serializes concurrent links so two inserts cannot both pass the sum.
create or replace function public.guard_bank_deposit_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deposit public.bank_deposits%rowtype;
  v_payment record;
  v_linked  numeric;
  v_this    numeric;
begin
  select * into v_deposit
    from public.bank_deposits d
    where d.id = new.deposit_id
    for update;

  -- Let the foreign key report a dangling deposit_id.
  if not found then
    return new;
  end if;

  if new.user_id <> v_deposit.user_id then
    raise exception 'Deposit link owner mismatch'
      using errcode = 'check_violation';
  end if;

  if new.kind in ('recorded', 'linked') then
    if v_deposit.is_stripe_payout then
      raise exception 'A Stripe payout is never new income'
        using errcode = 'check_violation',
              hint = 'Those pay out money already counted.';
    end if;
    if exists (
      select 1 from public.bank_deposit_links l
      where l.deposit_id = new.deposit_id
        and l.kind in ('stripe_payout', 'not_income')
        and (tg_op = 'INSERT' or l.id <> new.id)
    ) then
      raise exception 'This deposit was already marked as not income'
        using errcode = 'check_violation';
    end if;
  else
    if exists (
      select 1 from public.bank_deposit_links l
      where l.deposit_id = new.deposit_id
        and l.payment_id is not null
        and (tg_op = 'INSERT' or l.id <> new.id)
    ) then
      raise exception 'This deposit already has a payment'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.payment_id is not null then
    select p.entry_type,
           p.amount,
           p.stripe_checkout_session_id,
           p.stripe_event_id,
           p.stripe_payment_intent_id,
           p.stripe_object_id,
           p.reverses_payment_id
      into v_payment
      from public.invoice_payments p
      where p.id = new.payment_id
        and p.user_id = new.user_id;

    if not found then
      raise exception 'Payment does not belong to this owner'
        using errcode = 'check_violation';
    end if;

    -- A deposit is cash the owner received; a Stripe row is card money already
    -- counted and a reversal is a correction. Neither may take a deposit link.
    if v_payment.entry_type <> 'payment'
      or v_payment.amount <= 0
      or v_payment.stripe_checkout_session_id is not null
      or v_payment.stripe_event_id is not null
      or v_payment.stripe_payment_intent_id is not null
      or v_payment.stripe_object_id is not null
      or v_payment.reverses_payment_id is not null
    then
      raise exception 'Only a manual payment can be linked to a deposit'
        using errcode = 'check_violation';
    end if;

    v_this := v_payment.amount;

    select coalesce(sum(p.amount), 0)
      into v_linked
      from public.bank_deposit_links l
      join public.invoice_payments p on p.id = l.payment_id
      where l.deposit_id = new.deposit_id
        and (tg_op = 'INSERT' or l.id <> new.id);

    if v_linked + v_this > v_deposit.amount then
      raise exception 'Linked payments exceed the deposit'
        using errcode = 'check_violation',
              hint = 'Link an amount no greater than the deposit.';
    end if;
  end if;

  return new;
end;
$$;

-- Trigger functions are invoked by the table owner; clients never need EXECUTE.
revoke execute on function public.guard_bank_deposit_link()
  from public, anon, authenticated;

drop trigger if exists guard_bank_deposit_link on public.bank_deposit_links;
create trigger guard_bank_deposit_link
  before insert or update on public.bank_deposit_links
  for each row
  execute function public.guard_bank_deposit_link();

-- 4 ── RLS: owner reads, service role writes ─────────────────────
alter table public.bank_deposits enable row level security;
alter table public.bank_deposit_links enable row level security;

drop policy if exists "own bank deposits select" on public.bank_deposits;
create policy "own bank deposits select" on public.bank_deposits
  for select using (auth.uid() = user_id);

drop policy if exists "own bank deposit links select" on public.bank_deposit_links;
create policy "own bank deposit links select" on public.bank_deposit_links
  for select using (auth.uid() = user_id);

-- No write policy and no write grant: sync and the deposit route run on the
-- service role, scoped by user_id in code.
revoke all on public.bank_deposits from anon, authenticated;
revoke all on public.bank_deposit_links from anon, authenticated;

grant select on public.bank_deposits to authenticated;
grant select on public.bank_deposit_links to authenticated;

grant select, insert, update, delete on public.bank_deposits to service_role;
grant select, insert, update, delete on public.bank_deposit_links to service_role;

revoke truncate on public.bank_deposits, public.bank_deposit_links
  from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════
-- Verification — run after applying.
--
-- 1. Both tables have RLS and exactly one owner SELECT policy, no write policy.
-- 2. bank_deposit_links_payment_chk, the two partial unique indexes and the
--    guard trigger exist.
-- 3. Boundary cases (in a transaction you roll back):
--    • deposit 100, link a payment of 100  → succeeds
--    • deposit 100, link 60 then 60        → second link fails (over the deposit)
--    • deposit 100, link 60 twice (same payment) → unique index refuses
--    • deposit flagged is_stripe_payout, any payment link → refused
--    • deposit with not_income, any payment link → refused
--    • deposit with a payment link, not_income → refused
--    • another owner's payment_id → refused
--    • a Stripe-paid row, a non-payment entry or a reversal link → refused
--    • a payment whose amount is zero or negative → refused
-- ═══════════════════════════════════════════════════════════════
