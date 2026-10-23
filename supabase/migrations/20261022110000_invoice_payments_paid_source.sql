-- ═══════════════════════════════════════════════════════════════
-- invoice_payments.paid_source - which path wrote a ledger row.
--
-- The ledger is the source of truth for how an invoice was paid. A row can be
-- written by the owner (Record payment), by the Chat "Yes, they paid" sheet,
-- or by the Stripe Connect webhook. This records the path without changing the
-- existing `method` or `paid_at` columns.
--
-- Values:
--   payment_check_card  Chat payment check sheet (this release)
--   manual              Record payment (reserved; existing rows stay null)
--   webhook             Stripe Connect Checkout
--
-- NULL is allowed for every payment written before this migration, and for
-- any future writer that has not been taught a source yet. No backfill: the
-- existing rows keep NULL rather than pretending we know their source.
-- ═══════════════════════════════════════════════════════════════

alter table public.invoice_payments
  add column if not exists paid_source text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'invoice_payments_paid_source_chk') then
    alter table public.invoice_payments
      add constraint invoice_payments_paid_source_chk
      check (paid_source is null or paid_source in ('payment_check_card', 'manual', 'webhook'));
  end if;
end $$;

comment on column public.invoice_payments.paid_source is
  'Writer of this ledger row: payment_check_card, manual, webhook; null for rows created before 2026-10-22.';
