-- ═══════════════════════════════════════════════════════════════
-- Tiers phase 2, item 5: the skipped-photos note on a NEW document — ADDITIVE
-- (two nullable columns and a check on one of the new columns; per CLAUDE.md
-- "Database migrations" this may be pushed from a feature branch before the
-- merge, because the code on `main` ignores what it does not know about).
--
-- When a non-Plus user converts an estimate (or revises a document), the copy
-- is made without its photos: the attachment gates refuse each NEW file. These
-- columns let the new document remember that, so the note from design/tiers 05
-- ("Photos weren't copied. Adding photos is part of Plus. E-0051 keeps them.")
-- can still show after a reload:
--
--   attachments_skipped       how many files the plan refused (null = the note
--                             does not apply: flag off, or nothing skipped)
--   attachments_skipped_from  the SOURCE document's number (invoices.
--                             invoice_number on the estimate it was copied
--                             from), so the note can name what kept them
--
-- Additive and idempotent: nullable, no default, NO BACKFILL — every existing
-- row stays null, and nothing on `main` reads either column. Re-running this
-- file is a no-op.
--
-- Privileges: no grant is added. public.invoices is granted at TABLE level to
-- authenticated (the owner's rows only, by RLS), so a new column inherits that
-- automatically; there is no per-column grant to widen. Authenticated users CAN
-- write both columns on their own rows, and that is safe:
--   • RLS still scopes every row to auth.uid() = user_id, so a user can only
--     change the note on a document they own.
--   • The values are display-only. Nothing reads them to decide access, a
--     limit, money, a total, the public invoice page or a PDF — the note is a
--     toast. A user spoofing their own note gains nothing and misleads nobody
--     else.
--   • The count cannot go negative (the check below), so a hostile value can
--     only make a silly note on the user's own screen.
--   • lock_sent_invoice_fields (20260918000007) pins the money, billed party,
--     notes and render snapshot on a non-draft row; it never touches these two,
--     and the convert/revision write happens while the new row is a draft.
-- ═══════════════════════════════════════════════════════════════

alter table public.invoices
  add column if not exists attachments_skipped integer,
  add column if not exists attachments_skipped_from integer;

-- A count can never be negative. Null (unknown / not attempted) passes a CHECK
-- as "not unknown", so an untouched row stays valid.
alter table public.invoices
  drop constraint if exists invoices_attachments_skipped_nonneg;
alter table public.invoices
  add constraint invoices_attachments_skipped_nonneg
    check (attachments_skipped >= 0);
