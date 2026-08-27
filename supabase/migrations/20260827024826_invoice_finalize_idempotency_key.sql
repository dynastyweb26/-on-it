-- ═══════════════════════════════════════════════════════════════
-- Finalize idempotency — server-side guarantee that "send twice" can never
-- create two invoices.
--
-- The chat finalize flow is multi-step (insert draft → render → PDF → native
-- share → mark sent). An app/tab switch during the share can reload the tab and
-- lose the client-side breadcrumb (pendingInvoice in localStorage), so a resumed
-- finalize re-ran the INSERT and assign_document_number burned a fresh number —
-- producing duplicate invoices (observed in production). A client-only guard
-- cannot meet the "never" bar; the guarantee has to live in the database.
--
-- finalize_key: a stable, client-generated token per draft (the conversation
-- id). The client sends it on the insert. A partial unique index on
-- (user_id, finalize_key) means a resumed finalize re-inserting with the SAME
-- key hits the constraint instead of creating a row; the client catches the
-- violation, reads the existing row back, and continues from it.
--
--   * Nullable + partial index (WHERE finalize_key IS NOT NULL): rows that don't
--     carry a key — the quote→invoice conversion insert, and any pre-existing
--     row — are unaffected. Only the chat finalize sets it.
--   * Per-user scope, matching every other uniqueness rule on this table.
--   * char_length cap (SECURITY.md: every text column has a CHECK backstop).
--
-- No backfill, no RLS change (invoices is already owner-only). Idempotent:
-- add-column-if-not-exists, guarded constraint add, create-index-if-not-exists.
-- ═══════════════════════════════════════════════════════════════

alter table public.invoices
  add column if not exists finalize_key text;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'invoices_finalize_key_len'
  ) then
    alter table public.invoices
      add constraint invoices_finalize_key_len
      check (finalize_key is null or char_length(finalize_key) <= 64);
  end if;
end $$;

-- The idempotency guarantee: at most one invoice per (user, finalize_key).
create unique index if not exists invoices_user_finalize_key_idx
  on public.invoices (user_id, finalize_key)
  where finalize_key is not null;
