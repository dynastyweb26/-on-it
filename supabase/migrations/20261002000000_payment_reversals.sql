-- ═══════════════════════════════════════════════════════════════
-- invoice_payments: refunds and disputes as reversal rows (cash basis).
--
-- A refund or a dispute on a Stripe card payment moves money OUT of the
-- seller's account. Until now the ledger only knew money IN (amount > 0), so a
-- refunded or charged-back invoice stayed 'paid' and its money stayed in Books.
--
-- Model: every cash movement is its own ledger row, dated when it happened.
--   entry_type          sign   written by
--   payment             +      user (Record payment) or the Connect webhook
--   refund              −      webhook: a Stripe refund (re_ / pyr_)
--   dispute_withdrawn   −      webhook: charge.dispute.funds_withdrawn (du_)
--   dispute_reinstated  +      webhook: charge.dispute.funds_reinstated (du_)
--
-- Why rows and not a status on the payment: every income reader (Books
-- Collected, the Summary's Brought in, the Income PDF, the recap) already sums
-- invoice_payments.amount bucketed by paid_at. A −$850 row dated in October
-- takes $850 out of October and leaves September's income as it was, which is
-- what cash basis means. A status flag would instead erase September's income
-- retroactively and every reader would need a filter.
--
-- Invoice status needs no change: reconcile_invoice_from_ledger
-- (20260930000002) sums the ledger, so a reversal drops amount_paid and a
-- 'paid' invoice that loses cover reverts to 'sent' (balance due again);
-- a reinstatement brings it back to 'paid'.
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
-- verbatim, so privilege check E still matches.
--
-- Also: stripe_payment_intent_id on card payment rows, so a charge.* event
-- (which carries the PaymentIntent, not the Checkout Session) finds its
-- ledger row with one query. Written by the webhook going forward; older rows
-- are filled lazily by the webhook on their first refund/dispute.
--
-- And notification_log.event_type gains 'payment_disputed'.
--
-- Idempotent: if-not-exists columns, guarded constraints, drop-then-create
-- policies and type check.
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

-- 4 ── notification_log: allow the dispute push ──────────────────
-- Full list, superseding 20260930000004's.
alter table public.notification_log drop constraint if exists notification_log_type_chk;
alter table public.notification_log add constraint notification_log_type_chk
  check (event_type in ('payment_received', 'payment_disputed', 'connect_problem',
                        'invoice_viewed', 'draft_unsent', 'test'));

-- ── Verification — run after applying ─────────────────────────
--
-- 1. Existing rows untouched (expect: every row 'payment', 0 non-positive):
-- select entry_type, count(*), count(*) filter (where amount <= 0) as non_positive
-- from public.invoice_payments group by entry_type;
--
-- 2. Exactly one amount rule (the named sign check), no bare amount > 0:
-- select conname, pg_get_constraintdef(oid) from pg_constraint
-- where conrelid = 'public.invoice_payments'::regclass and contype in ('c', 'u')
-- order by conname;
--
-- 3. Policies: still exactly four, the write ones now also require
--    entry_type = 'payment' and stripe_object_id IS NULL (privilege check P,
--    proposed below; E keeps passing):
-- select policyname, cmd, qual, with_check from pg_policies
-- where tablename = 'invoice_payments' order by policyname;
--
-- Proposed privilege_check.sql row (add once feat/paywall-v2, which also
-- edits that file, is merged):
--
--   -- P. Payment reversals (20261002000000): users can't write reversal rows;
--   --    one sign rule; (entry_type, stripe_object_id) UNIQUE; reversal rows
--   --    are owned by the invoice's owner and point at a payment on the same
--   --    invoice.
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
--     and not exists (
--       select 1 from public.invoice_payments r
--       join public.invoice_payments p on p.id = r.reverses_payment_id
--       join public.invoices i on i.id = r.invoice_id
--       where r.user_id <> i.user_id or p.invoice_id <> r.invoice_id),
--     'write policies refuse reversals; sign check; unique key; 0 mismatched reversals',
--     (select count(*)::text from public.invoice_payments where entry_type <> 'payment')
-- ═══════════════════════════════════════════════════════════════
