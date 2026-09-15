-- 3.1 Payments ledger table + RLS
create table if not exists public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  amount numeric(12,2) not null check (amount > 0),
  method text not null check (method in ('zelle','cash','check','card','other')),
  paid_at timestamptz not null default now(),
  note text,
  stripe_event_id text unique,
  created_at timestamptz not null default now()
);

create index if not exists invoice_payments_invoice_id_idx
  on public.invoice_payments (invoice_id);

alter table public.invoice_payments enable row level security;

drop policy if exists "own invoice payments" on public.invoice_payments;
create policy "own invoice payments" on public.invoice_payments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3.2 Sync trigger for amount_paid
create or replace function public.sync_invoice_amount_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (TG_OP = 'DELETE' or TG_OP = 'UPDATE') and OLD.invoice_id is not null then
    update public.invoices
    set amount_paid = coalesce(
      (select sum(amount) from public.invoice_payments where invoice_id = OLD.invoice_id), 0
    )
    where id = OLD.invoice_id;
  end if;

  if (TG_OP = 'INSERT' or TG_OP = 'UPDATE') and NEW.invoice_id is not null then
    update public.invoices
    set amount_paid = coalesce(
      (select sum(amount) from public.invoice_payments where invoice_id = NEW.invoice_id), 0
    )
    where id = NEW.invoice_id;
  end if;

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trigger_sync_invoice_amount_paid on public.invoice_payments;
create trigger trigger_sync_invoice_amount_paid
  after insert or update or delete on public.invoice_payments
  for each row
  execute function public.sync_invoice_amount_paid();

-- 3.3 Lock deposit terms once money has landed
create or replace function public.lock_deposit_terms()
returns trigger
language plpgsql
as $$
begin
  if OLD.amount_paid > 0 then
    NEW.deposit_type := OLD.deposit_type;
    NEW.deposit_value := OLD.deposit_value;
  end if;
  return NEW;
end $$;

drop trigger if exists lock_deposit_terms on public.invoices;
create trigger lock_deposit_terms
  before update on public.invoices
  for each row
  when (old.amount_paid > 0)
  execute function public.lock_deposit_terms();
