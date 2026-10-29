-- ═══════════════════════════════════════════════════════════════
-- invoice_payments.idempotency_key - one ledger row per submission.
--
-- Record payment (the invoice detail sheet) writes one ledger row per tap.
-- The button is guarded on the client, but a response lost in flight, a
-- retried request, or a second tab can still deliver the same submission
-- twice, and the ledger trigger would then add the amount twice.
--
-- The client mints one key per submission (at the tap) and reuses it for every
-- retry. The partial unique index makes the second write a no-op instead of a
-- second row; the client reads the row back by key so a repeat returns the
-- ORIGINAL result.
--
-- Additive only: nullable column, no backfill (rows written before this
-- migration keep NULL and are not treated as duplicates of each other), no
-- drops, no changes to existing columns, no trigger changes.
-- ═══════════════════════════════════════════════════════════════

alter table public.invoice_payments
  add column if not exists idempotency_key text;

-- Partial: only keyed rows are constrained, so every historical NULL row (and
-- any future writer that has not been taught a key yet) stays valid.
create unique index if not exists invoice_payments_user_idempotency_key_uidx
  on public.invoice_payments (user_id, idempotency_key)
  where idempotency_key is not null;

comment on column public.invoice_payments.idempotency_key is
  'Client-minted key for one payment submission; repeats are ignored by invoice_payments_user_idempotency_key_uidx. Null on rows written before 2026-10-29.';
