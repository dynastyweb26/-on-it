-- ═══════════════════════════════════════════════════════════════
-- Line-item original AI text — passive training signal.
--
-- Each element of invoices.line_items (JSONB: [{description, qty, unit_price}])
-- may now carry an optional `original_description`: the wording the model
-- produced, recorded by the client at INSERT time ONLY when the user edited the
-- description before sending. If the description ships unedited the field is
-- absent/null — and that null IS the positive signal (the AI wording was
-- accepted as-is). No feedback UI; nothing to read back here.
--
-- Protection: line_items is JSONB, not its own table, so there is no column to
-- grant column-level. It follows the SAME guarantee as invoice_number in
-- 20260825120000_quote_numbering_and_document_lock.sql — writable at INSERT,
-- pinned by a BEFORE UPDATE trigger afterward — which that migration notes is
-- "a stronger guarantee than a column grant". A client PATCH therefore cannot
-- rewrite the shipped line items, or the original_description recorded inside
-- them, after the row exists.
--
-- Safe by construction: no app flow updates line_items after insert — the only
-- invoice UPDATEs touch status / sent_at / paid_at / due_date / last_nudge_at,
-- and quote→invoice conversion is a fresh INSERT (converted_from), not an
-- in-place edit. Pinning is thus invisible to every legitimate update and, as a
-- bonus, makes invoice content (amounts and descriptions) immutable once sent.
--
-- No new table, no RLS change (invoices is already owner-only under RLS), no
-- backfill: existing rows simply have no original_description on their items.
-- Idempotent: create-or-replace function, drop-then-create trigger.
-- ═══════════════════════════════════════════════════════════════

-- ── Pin invoice line items on UPDATE ─────────────────────────
-- Kept separate from lock_document_identity (number/kind) so each lock states
-- one intent. Both are BEFORE UPDATE and only reassign NEW fields, so they
-- compose without ordering concerns.
create or replace function public.lock_line_items()
returns trigger
language plpgsql
as $$
begin
  -- Writable at INSERT, immutable after: the shipped line items and the
  -- original_description within them cannot be changed by a later PATCH.
  NEW.line_items := OLD.line_items;
  return NEW;
end $$;

drop trigger if exists lock_line_items on public.invoices;
create trigger lock_line_items
  before update on public.invoices
  for each row execute function public.lock_line_items();
