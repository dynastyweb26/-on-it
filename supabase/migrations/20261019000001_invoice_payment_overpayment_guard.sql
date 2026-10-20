-- ═════════════════════════════════════════════════════════════════════════════
-- Manual payments may not push an invoice past its total.
--
-- The Record payment sheet now blocks an overpayment before it calls the
-- ledger, but the browser is not the only writer. This BEFORE trigger is the
-- database backstop for a manual insert (or an edit that moves money between
-- invoices): it locks the invoice, sums every non-refund ledger row, and
-- rejects the row when that sum plus the new amount is above the total.
--
-- Deliberately NOT guarded:
--   • Stripe rows (checkout session / event / payment intent / reversal
--     object) are written by the Connect webhook. Rejecting one makes the
--     webhook return 500, so Stripe retries and the payment never lands.
--   • Refund and dispute rows move money the other way. A dispute
--     reinstatement is positive and must never be blocked, even if a manual
--     replacement payment already covered the invoice.
--   • DELETE never adds money, so the trigger is INSERT/UPDATE only.
--
-- The row's own id is excluded on UPDATE so editing an existing manual payment
-- compares against the other rows, not against its old amount. `UPDATE OF
-- amount, invoice_id` keeps unrelated column writes (note, paid_at, method)
-- from taking the lock or re-running the check.
--
-- This does NOT close the separate P1 hole where a client can PATCH
-- invoices.amount_paid directly. That needs a column-grant lockdown; it is
-- logged, not built here.
--
-- Idempotent: create-or-replace function, drop-then-create trigger.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.guard_invoice_payment_overpay()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total numeric;
  v_paid  numeric;
begin
  -- Manual rows only. Every Stripe-sourced row is skipped, including the
  -- legacy stripe_event_id shape and the reversal columns from 20261018000000.
  if new.entry_type <> 'payment'
     or new.stripe_checkout_session_id is not null
     or new.stripe_event_id is not null
     or new.stripe_payment_intent_id is not null
     or new.stripe_object_id is not null
     or new.reverses_payment_id is not null
  then
    return new;
  end if;

  -- Serialize manual writes for this invoice so two concurrent inserts cannot
  -- both read the same pre-insert sum.
  select i.total
    into v_total
    from public.invoices i
    where i.id = new.invoice_id
    for update;

  if not found then
    -- Let the foreign key report a dangling invoice_id, not this trigger.
    return new;
  end if;

  -- Match reconcile_invoice_from_ledger: refunds are excluded from paid;
  -- payments and dispute withdrawals/reinstatements are included. On UPDATE,
  -- exclude this row so its old amount is not counted twice.
  select coalesce(sum(p.amount), 0)
    into v_paid
    from public.invoice_payments p
    where p.invoice_id = new.invoice_id
      and p.entry_type <> 'refund'
      and (tg_op = 'INSERT' or p.id <> new.id);

  if v_paid + new.amount > v_total then
    raise exception 'Payment exceeds the invoice balance'
      using errcode = 'check_violation',
            hint = 'Record an amount no greater than the remaining balance.';
  end if;

  return new;
end;
$$;

-- Trigger functions are invoked by the table owner; clients never need EXECUTE.
revoke execute on function public.guard_invoice_payment_overpay()
  from public, anon, authenticated;

drop trigger if exists guard_invoice_payment_overpay on public.invoice_payments;
create trigger guard_invoice_payment_overpay
  before insert or update of amount, invoice_id on public.invoice_payments
  for each row
  execute function public.guard_invoice_payment_overpay();

commit;

-- ═════════════════════════════════════════════════════════════════════════════
-- Verification — run after applying.
--
-- 1. Exactly one manual-payment guard trigger, BEFORE INSERT/UPDATE OF
--    amount, invoice_id, and a SECURITY DEFINER function with no search path:
-- select t.tgname, pg_get_triggerdef(t.oid), p.prosecdef, p.proconfig
-- from pg_trigger t
-- join pg_proc p on p.oid = t.tgfoid
-- where t.tgrelid = 'public.invoice_payments'::regclass
--   and t.tgname = 'guard_invoice_payment_overpay';
--
-- 2. Boundary cases (in a transaction you roll back):
--    • invoice total 100, existing manual 100  → another manual 0.01 fails
--    • invoice total 100, existing manual 20   → manual 80 succeeds
--    • invoice total 100, existing manual 20   → manual 80.01 fails
--    • Stripe payment / refund / dispute rows still insert even when they
--      would put the non-refund sum above total
--    • UPDATE of an existing manual row compares against the other rows
--    • two concurrent manual inserts: one succeeds, the other waits and fails
--
-- 3. Data state after the INV-123 cleanup: zero overpaid invoices.
-- select count(*) from public.invoices i
-- where i.deleted_at is null
--   and i.amount_paid > i.total;
-- ═════════════════════════════════════════════════════════════════════════════
