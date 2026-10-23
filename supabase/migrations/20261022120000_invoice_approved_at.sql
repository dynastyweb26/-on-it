-- Quote signed state (Mark as signed, Phase 2).
--
-- A quote is signed when the contractor says so; this records the moment.
-- There is no signature capture (no image, name, or public sign page) and no
-- new status value: the quote stays status 'sent', so the existing sent-document
-- lock and convert flow are unchanged. NULL means not signed (including every
-- row written before this migration).
--
-- Additive: nullable column, no backfill. The owner-only RLS policy bounds who
-- can write it; pin_invoice_server_columns intentionally does not pin it because
-- the detail page puts it back to NULL when the contractor taps Undo.

alter table public.invoices
  add column if not exists approved_at timestamptz;

comment on column public.invoices.approved_at is
  'When the contractor marked this quote as signed (manual, no signature capture); null when unsigned.';
