-- Lock invoices' server-owned columns against client writes (P1).
--
-- authenticated still has table-level UPDATE on public.invoices, and RLS is
-- owner-only, so before this trigger a raw REST PATCH could set amount_paid,
-- status or paid_at directly. That bypasses the payment ledger, the send route,
-- the overpayment guard and the follow-up engine.
--
-- Column grants alone would mean revoking table-level INSERT/UPDATE and then
-- re-granting every user-editable column. That list is broad and changes with
-- every invoice field (line items, deposits, notes, private notes, due date,
-- soft delete, ...); one missed column is a broken save. A BEFORE trigger is
-- narrower: the client still writes the same columns it always did, but the
-- server-owned columns are rejected with SQLSTATE 42501.
--
-- Server-owned columns pinned here:
--   amount_paid    - reconcile_invoice_from_ledger (SECURITY DEFINER)
--   status         - send route, ledger reconcile, Stripe webhook, admin tools
--   paid_at        - ledger reconcile / Stripe
--   sent_at        - send route
--   first_sent_at  - set_first_sent_at trigger
--   viewed_at      - mark_invoice_viewed RPC
--   last_nudge_at  - /api/followups cron
--
-- Already pinned elsewhere and deliberately left alone:
--   refunded_amount  - pin_invoice_refunded_amount (20261018000000)
--   invoice_number / kind - lock_document_identity (20260825120000)
--   created_at       - pin_created_at (20261001000001)
--   content / render snapshot - lock_sent_invoice_fields (20260918000007)
--
-- The trigger checks current_user, matching pin_invoice_refunded_amount. The
-- service role, postgres and the SECURITY DEFINER reconcile/send functions are
-- all allowed to move these columns; only anon/authenticated are blocked.
--
-- App audit (2026-10-20): the client inserts drafts only and updates notes,
-- line items, totals, deposits, due date and deleted_at. The send route is the
-- sole client-facing path that changes status, and it runs with the admin
-- (service-role) client. Payment inserts go through the ledger, whose
-- SECURITY DEFINER trigger reconciles the invoice.
--
-- Idempotent: create-or-replace function, drop-then-create trigger.

create or replace function public.pin_invoice_server_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Service role, migrations, and SECURITY DEFINER ledger/send functions all
  -- run as a non-client role. They are the only writers of these columns.
  if current_user not in ('anon', 'authenticated') then
    return NEW;
  end if;

  if tg_op = 'INSERT' then
    -- A client may create a draft only. A born-sent or born-paid row would
    -- bypass the send route and the ledger entirely.
    if NEW.amount_paid is distinct from 0
       or NEW.status is distinct from 'draft'
       or NEW.paid_at is not null
       or NEW.sent_at is not null
       or NEW.first_sent_at is not null
       or NEW.viewed_at is not null
       or NEW.last_nudge_at is not null
    then
      raise exception 'Invoice server-owned fields cannot be set by clients'
        using errcode = 'insufficient_privilege',
              hint = 'Create the invoice as a draft, then send it through the invoice send endpoint.';
    end if;
  else
    -- A client may update the invoice's content, but not move money, change
    -- lifecycle state, or forge server timestamps.
    if NEW.amount_paid is distinct from OLD.amount_paid
       or NEW.status is distinct from OLD.status
       or NEW.paid_at is distinct from OLD.paid_at
       or NEW.sent_at is distinct from OLD.sent_at
       or NEW.first_sent_at is distinct from OLD.first_sent_at
       or NEW.viewed_at is distinct from OLD.viewed_at
       or NEW.last_nudge_at is distinct from OLD.last_nudge_at
    then
      raise exception 'Invoice server-owned fields cannot be changed by clients'
        using errcode = 'insufficient_privilege',
              hint = 'Record payments through invoice_payments; send through the invoice send endpoint.';
    end if;
  end if;

  return NEW;
end;
$$;

-- Trigger functions are invoked by the table owner; clients never need EXECUTE.
revoke execute on function public.pin_invoice_server_columns()
  from public, anon, authenticated;

drop trigger if exists pin_invoice_server_columns on public.invoices;
create trigger pin_invoice_server_columns
  before insert or update of amount_paid, status, paid_at, sent_at,
    first_sent_at, viewed_at, last_nudge_at
  on public.invoices
  for each row
  execute function public.pin_invoice_server_columns();

-- Verification after applying:
--
-- 1. The trigger is wired and the function is invoker-only:
-- select t.tgname, pg_get_triggerdef(t.oid), p.prosecdef, p.proconfig
-- from pg_trigger t join pg_proc p on p.oid = t.tgfoid
-- where t.tgrelid = 'public.invoices'::regclass
--   and t.tgname = 'pin_invoice_server_columns';
--
-- 2. As authenticated (owns the test row), these fail with 42501:
-- update public.invoices set amount_paid = 1 where id = '<invoice>';
-- update public.invoices set status = 'sent' where id = '<invoice>';
-- update public.invoices set paid_at = now() where id = '<invoice>';
--
-- 3. The service role and a ledger payment still work:
-- update public.invoices set status = 'sent' where id = '<invoice>'; -- as service_role
-- insert into public.invoice_payments (invoice_id, user_id, amount, method)
-- values ('<invoice>', '<user>', 100, 'cash'); -- as authenticated
--
-- The proof script is supabase/tests/invoice_server_columns_proofs.sql.
