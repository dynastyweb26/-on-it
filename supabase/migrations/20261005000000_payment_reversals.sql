-- ═══════════════════════════════════════════════════════════════
-- invoice_payments: refunds and disputes as reversal rows (cash basis).
--
-- A refund or a dispute on a Stripe card payment moves money OUT of the
-- seller's account. Until now the ledger only knew money IN (amount > 0), so a
-- refunded or charged-back payment stayed in Books.
--
-- Model: every cash movement is its own ledger row, dated when it happened.
--   entry_type          sign   written by
--   payment             +      user (Record payment) or the Connect webhook
--   refund              −      webhook: a Stripe refund (re_ / pyr_)
--   dispute_withdrawn   −      webhook: charge.dispute.funds_withdrawn (du_)
--   dispute_reinstated  +      webhook: charge.dispute.funds_reinstated (du_)
--
-- Income (cash basis): every income reader (Books Collected, the Summary's
-- Brought in, the Income PDF, the recap) sums invoice_payments.amount bucketed
-- by paid_at. A −$850 row dated in October takes $850 out of October and
-- leaves September's income as it was. All four entry types count.
--
-- Paid toward the invoice is a different question, and refunds and disputes
-- answer it differently (founder decision 2026-10-02):
--   • A REFUND is the seller's choice. It does NOT reduce what was paid toward
--     the invoice: the invoice stays 'paid', owes nothing, gets no followups,
--     and its pay link stays closed. invoices.refunded_amount (new, ≥ 0)
--     carries the refunded total for the "Refunded" / "Refunded $X" label.
--   • A DISPUTE withdrawal DOES reduce it (and a reinstatement restores it):
--     a lost dispute means the client took the money back, so the invoice is
--     owed again, reverts 'paid' → 'sent', followups resume and the pay link
--     reopens. A won dispute nets to zero.
-- So reconcile_invoice_from_ledger now computes
--   amount_paid     = Σ amount over entry_type <> 'refund'
--                     (payments − dispute withdrawals + reinstatements)
--   refunded_amount = −Σ amount over entry_type = 'refund'
--   paid_at         = latest paid_at of a positive, non-refund row
-- Everything else in it is unchanged from 20260930000002.
--
-- Idempotency (Stripe retries; one refund shows up in several events):
-- (entry_type, stripe_object_id) is UNIQUE and the webhook inserts with
-- ON CONFLICT DO NOTHING. stripe_object_id is the refund id or the dispute id,
-- never an event id.
--
-- RLS: reversal rows are Stripe-sourced and as untouchable as Stripe payments.
-- The write policies additionally require entry_type = 'payment' and every new
-- Stripe column null, so a user can't forge a refund, a negative row, or stamp
-- a PaymentIntent onto a manual row. The existing conditions are kept
-- verbatim, so privilege check E still matches. invoices.refunded_amount is
-- pinned against direct writes by anon/authenticated (only the ledger
-- reconcile and the service role set it).
--
-- Also: stripe_payment_intent_id on card payment rows, so a charge/refund/
-- dispute event (which carries the PaymentIntent, not the Checkout Session)
-- finds its ledger row with one query. Written by the webhook going forward;
-- older rows are filled by the webhook on their first refund/dispute.
--
-- And notification_log.event_type gains 'payment_disputed'.
--
-- ORDERING: feat/recap's 20261001000010_recaps.sql also rewrites
-- notification_log_type_chk (adds 'recap'). This file sorts after it and its
-- list is the union, so 'recap' survives. Whichever migration rewrites that
-- constraint next must carry 'payment_disputed' forward.
--
-- Idempotent: if-not-exists columns, guarded constraints, create-or-replace
-- functions, drop-then-create policies, triggers and type check.
-- ═══════════════════════════════════════════════════════════════

-- 1 ── Columns ───────────────────────────────────────────────────
alter table public.invoice_payments
  add column if not exists entry_type text not null default 'payment',
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_object_id text,
  add column if not exists reverses_payment_id uuid
    references public.invoice_payments(id) on delete cascade;

create unique index if not exists invoice_payments_stripe_pi_key
  on public.invoice_payments (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create index if not exists invoice_payments_reverses_idx
  on public.invoice_payments (reverses_payment_id)
  where reverses_payment_id is not null;

alter table public.invoices
  add column if not exists refunded_amount numeric(12,2) not null default 0;

-- 2 ── Constraints ───────────────────────────────────────────────
-- The original amount > 0 CHECK was declared inline (unnamed), so drop every
-- CHECK whose definition is the positive-amount rule, then add the named
-- sign rule. Existing rows are all entry_type 'payment' with amount > 0.
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.invoice_payments'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%amount > %'
      and pg_get_constraintdef(oid) not ilike '%entry_type%'
  loop
    execute format('alter table public.invoice_payments drop constraint %I', c.conname);
  end loop;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'invoice_payments_entry_type_chk') then
    alter table public.invoice_payments
      add constraint invoice_payments_entry_type_chk
      check (entry_type in ('payment', 'refund', 'dispute_withdrawn', 'dispute_reinstated'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'invoice_payments_amount_sign_chk') then
    alter table public.invoice_payments
      add constraint invoice_payments_amount_sign_chk
      check (
        (entry_type in ('payment', 'dispute_reinstated') and amount > 0)
        or (entry_type in ('refund', 'dispute_withdrawn') and amount < 0)
      );
  end if;

  -- A payment is not a reversal; a reversal names its Stripe object and the
  -- payment it reverses, and the object id has the right shape for its type.
  if not exists (select 1 from pg_constraint where conname = 'invoice_payments_reversal_shape_chk') then
    alter table public.invoice_payments
      add constraint invoice_payments_reversal_shape_chk
      check (
        (entry_type = 'payment'
           and stripe_object_id is null and reverses_payment_id is null)
        or (entry_type = 'refund'
           and reverses_payment_id is not null
           and stripe_object_id ~ '^(re|pyr)_[A-Za-z0-9_]+$'
           and char_length(stripe_object_id) <= 255)
        or (entry_type in ('dispute_withdrawn', 'dispute_reinstated')
           and reverses_payment_id is not null
           and stripe_object_id ~ '^du_[A-Za-z0-9_]+$'
           and char_length(stripe_object_id) <= 255)
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'invoice_payments_stripe_pi_chk') then
    alter table public.invoice_payments
      add constraint invoice_payments_stripe_pi_chk
      check (stripe_payment_intent_id is null
             or (stripe_payment_intent_id ~ '^pi_[A-Za-z0-9_]+$'
                 and char_length(stripe_payment_intent_id) <= 255));
  end if;

  -- The webhook's ON CONFLICT target. NULLs are distinct, so manual rows and
  -- Stripe payments (stripe_object_id null) never collide.
  if not exists (select 1 from pg_constraint where conname = 'invoice_payments_stripe_object_key') then
    alter table public.invoice_payments
      add constraint invoice_payments_stripe_object_key
      unique (entry_type, stripe_object_id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'invoices_refunded_amount_chk') then
    alter table public.invoices
      add constraint invoices_refunded_amount_chk check (refunded_amount >= 0);
  end if;
end $$;

-- 3 ── Write policies: users only ever touch plain manual payments ──
-- Same four policies as 20260926000000; the original conditions are kept
-- verbatim and the new Stripe columns are added to each.
drop policy if exists "own invoice payments insert" on public.invoice_payments;
drop policy if exists "own invoice payments update" on public.invoice_payments;
drop policy if exists "own invoice payments delete" on public.invoice_payments;

create policy "own invoice payments insert" on public.invoice_payments
  for insert
  with check (
    auth.uid() = user_id
    and stripe_checkout_session_id is null
    and stripe_event_id is null
    and entry_type = 'payment'
    and stripe_payment_intent_id is null
    and stripe_object_id is null
    and reverses_payment_id is null
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_payments.invoice_id
        and i.user_id = auth.uid()
    )
  );

create policy "own invoice payments update" on public.invoice_payments
  for update
  using (
    auth.uid() = user_id
    and stripe_checkout_session_id is null
    and stripe_event_id is null
    and entry_type = 'payment'
    and stripe_payment_intent_id is null
    and stripe_object_id is null
    and reverses_payment_id is null
  )
  with check (
    auth.uid() = user_id
    and stripe_checkout_session_id is null
    and stripe_event_id is null
    and entry_type = 'payment'
    and stripe_payment_intent_id is null
    and stripe_object_id is null
    and reverses_payment_id is null
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_payments.invoice_id
        and i.user_id = auth.uid()
    )
  );

create policy "own invoice payments delete" on public.invoice_payments
  for delete
  using (
    auth.uid() = user_id
    and stripe_checkout_session_id is null
    and stripe_event_id is null
    and entry_type = 'payment'
    and stripe_payment_intent_id is null
    and stripe_object_id is null
    and reverses_payment_id is null
  );

-- 4 ── Reconcile: refunds excluded from paid, tracked separately ──
-- Whole function restated from 20260930000002; only the aggregate and the
-- refunded_amount write are new (see header).
create or replace function public.reconcile_invoice_from_ledger(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv      record;
  v_paid     numeric;
  v_refunded numeric;
  v_max      timestamptz;
  v_full     boolean;
  v_leave    boolean;
begin
  -- Lock the invoice first so concurrent ledger changes reconcile one at a time.
  select i.status, i.kind, i.total, i.template
    into v_inv
    from public.invoices i
    where i.id = p_invoice_id
    for update;
  if not found then
    return;
  end if;

  select
    coalesce(sum(p.amount) filter (where p.entry_type <> 'refund'), 0),
    coalesce(-sum(p.amount) filter (where p.entry_type = 'refund'), 0),
    max(p.paid_at) filter (where p.entry_type <> 'refund' and p.amount > 0)
    into v_paid, v_refunded, v_max
    from public.invoice_payments p
    where p.invoice_id = p_invoice_id;

  v_full  := v_inv.total > 0 and v_paid >= v_inv.total;
  v_leave := v_inv.status = 'draft' and v_inv.kind = 'invoice' and v_paid > 0;

  -- Render snapshot while still a draft (see 20260930000002).
  if v_leave and v_inv.template is null then
    update public.invoices i
    set
      template         = pr.invoice_template,
      brand_colors     = pr.brand_colors,
      background_color = pr.background_color,
      business_name    = pr.business_name,
      logo_url         = pr.logo_url,
      website_url      = pr.website_url,
      slogan           = pr.slogan,
      cashapp_tag      = pr.cashapp_tag,
      paypal_me        = pr.paypal_me,
      venmo_username   = pr.venmo_username
    from public.profiles pr
    where i.id = p_invoice_id
      and pr.id = i.user_id;
  end if;

  update public.invoices i
  set
    amount_paid     = v_paid,
    refunded_amount = v_refunded,
    status = case
      when v_full and (i.status in ('sent', 'overdue') or v_leave) then 'paid'
      when v_leave                                                  then 'sent'
      when i.status = 'paid' and v_paid < i.total                   then 'sent'
      else i.status
    end,
    paid_at = case
      when v_full and (i.status in ('sent', 'overdue') or v_leave) then v_max
      when i.status = 'paid' and v_paid < i.total                   then null
      else i.paid_at
    end
  where i.id = p_invoice_id;
end;
$$;

revoke execute on function public.reconcile_invoice_from_ledger(uuid)
  from public, anon, authenticated;

-- 5 ── Pin refunded_amount against client writes ─────────────────
-- invoices has table-level UPDATE/INSERT for authenticated (RLS owner-only),
-- so without this a user could stamp "Refunded" on their own invoice. The
-- reconcile runs as its SECURITY DEFINER owner and the webhook as
-- service_role, so neither is affected.
create or replace function public.pin_invoice_refunded_amount()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if TG_OP = 'INSERT' then
      NEW.refunded_amount := 0;
    else
      NEW.refunded_amount := OLD.refunded_amount;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists pin_invoice_refunded_amount on public.invoices;
create trigger pin_invoice_refunded_amount
  before insert or update on public.invoices
  for each row
  execute function public.pin_invoice_refunded_amount();

-- 6 ── notification_log: allow the dispute push ──────────────────
-- Full list: 20260930000004's, plus feat/recap's 'recap' (20261001000010),
-- plus 'payment_disputed'.
alter table public.notification_log drop constraint if exists notification_log_type_chk;
alter table public.notification_log add constraint notification_log_type_chk
  check (event_type in ('payment_received', 'payment_disputed', 'connect_problem',
                        'invoice_viewed', 'draft_unsent', 'recap', 'test'));

-- 7 ── Backfill ────────────────────────────────────────────────────
-- None needed: every existing row is entry_type 'payment' (column default),
-- so amount_paid, status and paid_at reconcile to what they already are, and
-- refunded_amount defaults to 0.

-- ── Verification — run after applying ─────────────────────────
--
-- 1. Existing data untouched (expect every row 'payment', 0 non-positive;
--    0 invoices with refunded_amount <> 0; 0 amount_paid drift):
-- select entry_type, count(*), count(*) filter (where amount <= 0) as non_positive
-- from public.invoice_payments group by entry_type;
-- select count(*) filter (where refunded_amount <> 0) as refunded,
--        count(*) filter (where amount_paid <> coalesce((select sum(p.amount)
--          from public.invoice_payments p where p.invoice_id = i.id
--          and p.entry_type <> 'refund'), 0)) as drift
-- from public.invoices i;
--
-- 2. Exactly one amount rule (the named sign check), no bare amount > 0:
-- select conname, pg_get_constraintdef(oid) from pg_constraint
-- where conrelid = 'public.invoice_payments'::regclass and contype in ('c', 'u')
-- order by conname;
--
-- 3. Policies: still exactly four (check E keeps passing):
-- select policyname, cmd, qual, with_check from pg_policies
-- where tablename = 'invoice_payments' order by policyname;
--
-- 4. notification_log_type_chk lists payment_disputed AND recap.
--
-- Proposed privilege_check.sql row (add once feat/paywall-v2, which also
-- edits that file, is merged):
--
--   -- P. Payment reversals (20261005000000): users can't write reversal rows;
--   --    one sign rule; (entry_type, stripe_object_id) UNIQUE; refunded_amount
--   --    pinned; reversal rows owned by the invoice's owner and pointing at a
--   --    payment on the same invoice.
--   union all
--   select 'P payment reversals',
--     exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice_payments'
--       and policyname = 'own invoice payments insert'
--       and with_check ilike '%entry_type = ''payment''%' and with_check ilike '%stripe_object_id IS NULL%')
--     and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice_payments'
--       and policyname = 'own invoice payments delete'
--       and qual ilike '%entry_type = ''payment''%' and qual ilike '%stripe_object_id IS NULL%')
--     and exists (select 1 from pg_constraint where conrelid = 'public.invoice_payments'::regclass
--       and conname = 'invoice_payments_amount_sign_chk')
--     and exists (select 1 from pg_constraint where conrelid = 'public.invoice_payments'::regclass
--       and conname = 'invoice_payments_stripe_object_key' and contype = 'u')
--     and exists (select 1 from pg_trigger where tgrelid = 'public.invoices'::regclass
--       and tgname = 'pin_invoice_refunded_amount' and not tgisinternal)
--     and not exists (
--       select 1 from public.invoice_payments r
--       join public.invoice_payments p on p.id = r.reverses_payment_id
--       join public.invoices i on i.id = r.invoice_id
--       where r.user_id <> i.user_id or p.invoice_id <> r.invoice_id),
--     'write policies refuse reversals; sign check; unique key; refunded_amount pinned; 0 mismatched reversals',
--     (select count(*)::text from public.invoice_payments where entry_type <> 'payment')
-- ═══════════════════════════════════════════════════════════════
