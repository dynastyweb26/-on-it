-- Derive invoice "paid" status from the payments ledger.
--
-- "Mark paid" (which set status='paid' without a ledger row) is being removed, so
-- paid-ness must follow amount_paid, which the invoice_payments trigger already
-- keeps in sync. This migration:
--   1. teaches sync_invoice_amount_paid to flip status/paid_at with the money,
--   2. backfills a ledger row for invoices marked paid before the ledger existed,
--   3. promotes invoices already covered by the ledger but never marked paid.
--
-- Idempotent: create-or-replace functions, an insert guarded by NOT EXISTS, and a
-- promote pass that only touches sent/overdue invoices already fully covered.

-- 1 ── Reconcile one invoice against its ledger (amount_paid + status + paid_at).
--      Called by the trigger below for each invoice a ledger change touches.
--        • total covered (paid >= total, total > 0) and currently sent/overdue
--          → status 'paid', paid_at = latest ledger paid_at
--        • was 'paid' but the ledger no longer covers it (e.g. a payment deleted)
--          → revert to 'sent' and clear paid_at
--        • drafts and voids are never re-statused; only amount_paid is refreshed
create or replace function public.reconcile_invoice_from_ledger(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.invoices i
  set
    amount_paid = agg.paid,
    status = case
      when agg.paid >= i.total and i.total > 0 and i.status in ('sent', 'overdue')
        then 'paid'
      when i.status = 'paid' and agg.paid < i.total
        then 'sent'
      else i.status
    end,
    paid_at = case
      when agg.paid >= i.total and i.total > 0 and i.status in ('sent', 'overdue')
        then agg.max_paid_at
      when i.status = 'paid' and agg.paid < i.total
        then null
      else i.paid_at
    end
  from (
    select
      coalesce(sum(amount), 0) as paid,
      max(paid_at)             as max_paid_at
    from public.invoice_payments
    where invoice_id = p_invoice_id
  ) agg
  where i.id = p_invoice_id;
end;
$$;

-- Internal helper only — invoked by the SECURITY DEFINER trigger and this
-- migration, never by clients. Lock it down like get_public_invoice.
revoke execute on function public.reconcile_invoice_from_ledger(uuid)
  from public, anon, authenticated;

-- 2 ── Extend the ledger sync trigger to reconcile status alongside amount_paid.
--      Structure (guarded OLD/NEW blocks) is unchanged from the original; each
--      block now delegates to reconcile_invoice_from_ledger. The trigger itself
--      (trigger_sync_invoice_amount_paid on invoice_payments) is untouched.
create or replace function public.sync_invoice_amount_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (TG_OP = 'DELETE' or TG_OP = 'UPDATE') and OLD.invoice_id is not null then
    perform public.reconcile_invoice_from_ledger(OLD.invoice_id);
  end if;

  if (TG_OP = 'INSERT' or TG_OP = 'UPDATE') and NEW.invoice_id is not null then
    perform public.reconcile_invoice_from_ledger(NEW.invoice_id);
  end if;

  return coalesce(NEW, OLD);
end;
$$;

-- 3 ── Backfill: give every already-"paid" invoice that has no ledger row a single
--      row for what was implicitly collected (total - amount_paid). The insert
--      fires the trigger above, which sets amount_paid = total; status is already
--      'paid' so it is left as-is. Guarded so it only runs on invoices missing a
--      row, and only when the amount is positive (the ledger's amount > 0 check).
insert into public.invoice_payments (invoice_id, user_id, amount, method, paid_at, note)
select
  i.id,
  i.user_id,
  (i.total - i.amount_paid)          as amount,
  'other'                            as method,
  coalesce(i.paid_at, i.updated_at)  as paid_at,
  'backfill: marked paid before ledger existed' as note
from public.invoices i
where i.status = 'paid'
  and (i.total - i.amount_paid) > 0
  and not exists (
    select 1 from public.invoice_payments p where p.invoice_id = i.id
  );

-- 3b ─ One-time promote pass: invoices already covered by the ledger but still
--      sitting at sent/overdue (e.g. paid via the earlier amount_paid>0 backfill,
--      never marked paid). The trigger only fires on future ledger changes, so
--      reconcile them once here to bring existing data in line.
select public.reconcile_invoice_from_ledger(id)
from public.invoices
where status in ('sent', 'overdue')
  and total > 0
  and amount_paid >= total;

-- 4 ── Verification — run after applying. All four columns should read 0 / false.
--
-- select
--   count(*) filter (where status = 'paid' and amount_paid < total)                     as paid_but_underpaid,
--   count(*) filter (where status = 'paid' and not exists (
--                      select 1 from public.invoice_payments p where p.invoice_id = i.id)) as paid_without_ledger,
--   count(*) filter (where status in ('sent','overdue') and total > 0 and amount_paid >= total) as fully_paid_not_marked,
--   has_function_privilege('anon', 'public.reconcile_invoice_from_ledger(uuid)', 'execute') as anon_can_execute
-- from public.invoices i;
