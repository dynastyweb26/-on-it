alter table public.invoice_payments add column if not exists idempotency_key text;
create unique index if not exists invoice_payments_user_idempotency_key_uidx
  on public.invoice_payments (user_id, idempotency_key) where idempotency_key is not null;
