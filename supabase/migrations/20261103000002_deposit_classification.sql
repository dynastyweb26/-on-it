-- ═══════════════════════════════════════════════════════════════
-- MONEY IN — the deposit decision. CHANGING: this alters constraints and a
-- trigger on tables that already exist, so it runs on `main` after the merge,
-- never from a feature branch against production.
--
--   not_income → gone.  'Not income' was never a reason: the owner has to say
--               WHAT the money was. The kind set is now
--                 recorded      a ledger row this flow wrote
--                 linked        an existing ledger row
--                 classified    Other money received, non-income
--                               (vendor_refund | transfer | loan_or_owner |
--                               unknown) — recorded, counted nowhere
--                 ignored       Don't add. Restore deletes the row.
--                 stripe_payout auto-labeled: a sure Stripe payout, already
--                               counted as card money
--
--   ONE DEPOSIT = ONE PAYMENT. v1 links a single ledger row, so the partial
--   unique index on deposit_id (not just payment_id) is the enforcement, and
--   the guard's "sum of linked amounts" check is deleted as dead code. The two
--   refusals that stay: a payment bigger than the deposit, and a payment that
--   is already linked to another deposit (bank_deposit_links_payment_uidx).
--
--   ONE DECISION. A deposit is decided by one link row OR one other_income
--   row, never both and never two of either. The links guard now checks both
--   tables and a second guard watches other_income, so the rule holds whichever
--   side writes first. Both lock the deposit row FOR UPDATE, so two concurrent
--   inserts serialize instead of racing past the check.
--
-- 'stripe_payout' is KEPT and not folded into 'ignored': a sure payout is
-- auto-labeled and must survive a re-sync as its own state, so the owner can
-- still see "auto-labeled, not new income" in Ignored.
--
-- Idempotent. Verify after applying: npm run db:privcheck — BD3/BD4/BD7/BD8.
-- ═══════════════════════════════════════════════════════════════

-- 1 ── The old kind check goes first ────────────────────────────
-- 'ignored' is not in the OLD check, so this backfill would be refused while it
-- is still in place. Dropping it first leaves the column unconstrained for the
-- one statement below, which is narrower than leaving a row that satisfies
-- neither the old check nor the new one.
alter table public.bank_deposit_links
  drop constraint if exists bank_deposit_links_kind_check;

-- 2 ── Existing rows ───────────────────────────────────────────
-- The partial terminal index still names 'not_income' at this point, which is
-- harmless: its predicate drops these rows out of it and it is rebuilt in step
-- 5 anyway. No uniqueness can be violated — it held at most one row per
-- deposit already.
update public.bank_deposit_links
   set kind = 'ignored'
 where kind = 'not_income';

-- 3 ── The new kind set ────────────────────────────────────────
alter table public.bank_deposit_links
  add constraint bank_deposit_links_kind_check
  check (kind in ('recorded', 'linked', 'classified', 'ignored', 'stripe_payout'));

-- The payment-shape check is unchanged and still right: only recorded/linked
-- carry a payment_id, so a classified, ignored or payout row keeps it null.

-- 4 ── The classification, only on a classified link ────────────
alter table public.bank_deposit_links
  add column if not exists classification text;

alter table public.bank_deposit_links
  drop constraint if exists bank_deposit_links_classification_check;
alter table public.bank_deposit_links
  add constraint bank_deposit_links_classification_check
  check (classification is null or classification in (
    'customer_payment', 'vendor_refund', 'transfer', 'loan_or_owner',
    'other_income', 'unknown'
  ));

-- Required iff classified, and never set on any other kind: one iff, both ways.
alter table public.bank_deposit_links
  drop constraint if exists bank_deposit_links_classified_chk;
alter table public.bank_deposit_links
  add constraint bank_deposit_links_classified_chk
  check ((classification is not null) = (kind = 'classified'));

-- 5 ── One deposit, one payment ─────────────────────────────────
-- A deposit's money arrives as one deposit, so v1 records it as one payment.
-- Replaces the "sum of the linked amounts must not exceed the deposit" rule:
-- with a single row there is no sum to compute.
create unique index if not exists bank_deposit_links_payment_of_deposit_uidx
  on public.bank_deposit_links (deposit_id) where kind in ('recorded', 'linked');

-- A deposit is either income-linked or dismissed/classified, never both.
-- Rebuilt to cover the three non-income kinds.
drop index if exists public.bank_deposit_links_terminal_uidx;
create unique index bank_deposit_links_terminal_uidx
  on public.bank_deposit_links (deposit_id)
  where kind in ('classified', 'ignored', 'stripe_payout');

-- bank_deposit_links_payment_uidx is kept as is: one ledger row belongs to at
-- most one deposit, which is the "payment already linked" refusal.

-- 6 ── The guard, rewritten ────────────────────────────────────
-- A BEFORE INSERT/UPDATE trigger is the database backstop for the route:
--   • one decision per deposit, across bank_deposit_links and other_income;
--   • a deposit can never carry two link rows of any kind;
--   • only a plain manual payment can be linked: no Stripe row, no reversal;
--   • a payment bigger than the deposit is refused (one deposit, one payment);
--   • a link can never cross owners.
-- SECURITY DEFINER because the owner has no write grant; the lock on the
-- deposit serializes concurrent writes so two inserts cannot both pass.
create or replace function public.guard_bank_deposit_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deposit public.bank_deposits%rowtype;
  v_payment record;
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

  -- ONE decision, across both tables.
  if exists (
    select 1 from public.bank_deposit_links l
    where l.deposit_id = new.deposit_id
      and (tg_op = 'INSERT' or l.id <> new.id)
  ) then
    raise exception 'This deposit already has a decision'
      using errcode = 'check_violation',
            hint = 'One deposit takes one decision.';
  end if;

  if exists (
    select 1 from public.other_income o
    where o.deposit_id = new.deposit_id
  ) then
    raise exception 'This deposit is already recorded as other income'
      using errcode = 'check_violation',
            hint = 'Remove that other income row first.';
  end if;

  if new.kind in ('recorded', 'linked') then
    if v_deposit.is_stripe_payout then
      raise exception 'A Stripe payout is never new income'
        using errcode = 'check_violation',
              hint = 'Those pay out money already counted.';
    end if;

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

    -- One deposit, one payment: a bigger payment is refused, never split.
    if v_payment.amount > v_deposit.amount then
      raise exception 'Payment is bigger than the deposit'
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

-- 7 ── The other side of "one decision" ────────────────────────
-- Writepath for the deposit: an income classification writes an other_income
-- row instead of a link, so this guard enforces the same rule from that side.
-- A row with no deposit_id is a manual entry and passes straight through.
create or replace function public.guard_other_income_deposit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deposit public.bank_deposits%rowtype;
begin
  if new.deposit_id is null then
    return new;
  end if;

  select * into v_deposit
    from public.bank_deposits d
    where d.id = new.deposit_id
    for update;

  if not found then
    return new;
  end if;

  if new.user_id <> v_deposit.user_id then
    raise exception 'Other income owner mismatch'
      using errcode = 'check_violation';
  end if;

  if v_deposit.is_stripe_payout then
    raise exception 'A Stripe payout is never new income'
      using errcode = 'check_violation',
            hint = 'Those pay out money already counted.';
  end if;

  if exists (
    select 1 from public.bank_deposit_links l
    where l.deposit_id = new.deposit_id
  ) then
    raise exception 'This deposit already has a decision'
      using errcode = 'check_violation',
            hint = 'One deposit takes one decision.';
  end if;

  if exists (
    select 1 from public.other_income o
    where o.deposit_id = new.deposit_id
      and (tg_op = 'INSERT' or o.id <> new.id)
  ) then
    raise exception 'This deposit is already recorded as other income'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_other_income_deposit()
  from public, anon, authenticated;

drop trigger if exists guard_other_income_deposit on public.other_income;
create trigger guard_other_income_deposit
  before insert or update on public.other_income
  for each row
  execute function public.guard_other_income_deposit();

-- ═══════════════════════════════════════════════════════════════
-- Verification — run after applying.
--
-- 1. The kind check accepts the five new kinds and rejects 'not_income'
--    (privcheck BD8).
-- 2. bank_deposit_links_payment_of_deposit_uidx exists and is partial
--    (privcheck BD3).
-- 3. Boundary cases (in a transaction you roll back):
--    • deposit 100, record a payment of 100          → succeeds
--    • deposit 100, then a second link of any kind    → refused (one decision)
--    • deposit 100, linked, then an other_income row  → refused
--    • deposit 100, other_income row, then a link     → refused
--    • deposit 100, link a payment of 120             → refused (bigger)
--    • the same payment on a second deposit           → refused (payment_uidx)
--    • kind 'classified' with classification null     → refused
--    • kind 'ignored' with a classification           → refused
--    • kind 'not_income'                              → refused (gone)
--    • a Stripe payout deposit, any income row        → refused
-- ═══════════════════════════════════════════════════════════════
