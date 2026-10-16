-- ═══════════════════════════════════════════════════════════════
-- Owner-only invoice notes (pasted work cards, feat/pasted-notes-extraction).
--
-- A pasted service card carries text the customer must never see: tech and
-- manager names, long narrative notes. It is saved on the invoice row in
-- private_notes, read and written only by the owner through the existing
-- invoices RLS policies (no new policy, no new grant: invoices has no
-- column-level grants). Nothing public reads it: get_public_invoice() and
-- get_public_invoice_checkout() build their output column by column and are
-- not changed here, and the PDF is built client-side from render data that
-- doesn't include it.
--
-- Additive and idempotent. Verify after applying: npm run db:privcheck — W1
-- and W2 must PASS.
-- ═══════════════════════════════════════════════════════════════

alter table public.invoices
  add column if not exists private_notes text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'invoices_private_notes_len'
      and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices
      add constraint invoices_private_notes_len
        check (private_notes is null or char_length(private_notes) <= 4000);
  end if;
end $$;
