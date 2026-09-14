-- Add deposit and payment columns to public.invoices
alter table public.invoices
  add column if not exists deposit_type text check (deposit_type in ('percent', 'percentage', 'fixed', 'none')),
  add column if not exists deposit_value numeric,
  add column if not exists deposit_amount numeric,
  add column if not exists amount_paid numeric not null default 0;
