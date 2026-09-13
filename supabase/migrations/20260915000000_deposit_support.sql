-- Deposit support schema
alter table public.invoices
  add column if not exists deposit_type text
    check (deposit_type in ('percentage', 'fixed', 'none')),
  add column if not exists deposit_value numeric;
