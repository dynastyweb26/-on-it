-- Backfill existing invoice payments for invoices where amount_paid > 0
insert into public.invoice_payments (invoice_id, user_id, amount, method, paid_at, note)
select
  id as invoice_id,
  user_id,
  amount_paid as amount,
  'other' as method,
  coalesce(sent_at, created_at) as paid_at,
  'migrated' as note
from public.invoices
where amount_paid > 0
  and not exists (
    select 1 from public.invoice_payments where invoice_id = invoices.id
  );
