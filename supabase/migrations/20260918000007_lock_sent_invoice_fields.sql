-- ═══════════════════════════════════════════════════════════════
-- Draft-only lock: pin a sent invoice's document fields at the DB layer.
--
-- The app already refuses to write a non-draft invoice's content
-- (chat isLockedStatus guard, detail-page editors gated on isDraft), but that is
-- app-level only. Existing DB triggers pin only pieces: lock_document_identity
-- (invoice_number, kind), lock_line_items (line_items once non-draft),
-- lock_deposit_terms (deposit once amount_paid > 0). Everything else a document
-- states — money, billed party, notes, the render snapshot, the due date — is
-- still writable on a sent row via a raw REST PATCH.
--
-- This BEFORE UPDATE trigger pins those fields whenever the STORED row has left
-- draft (OLD.status <> 'draft'), so a sent/paid/overdue/void invoice is
-- immutable in content no matter who issues the update.
--
-- Deliberately LEFT WRITABLE (a legitimate path writes each on a non-draft row):
--   status, paid_at, amount_paid  — the ledger reconcile trigger
--                                    (reconcile_invoice_from_ledger) flips these
--   sent_at                       — resend() bumps it on a sent/paid invoice
--   deleted_at                    — soft delete / restore, any status
--   last_nudge_at                 — the /api/followups cron
--   updated_at, converted_from    — housekeeping / quote→invoice trail
--
-- PINNED here: subtotal, tax_rate, tax_amount, total, client_name,
-- client_address, client_phone, notes, deposit_type, deposit_value, due_date,
-- first_sent_at, and the render-snapshot columns (template, brand_colors,
-- background_color, business_name, logo_url, website_url, slogan, cashapp_tag,
-- paypal_me, venmo_username). due_date is pinned because changing a sent
-- invoice's due date changes what the customer owes by when while their PDF
-- still shows the old date — the detail-page date input is gated to drafts in
-- the same change set so it does not silently no-op.
--
-- The draft → sent transition itself carries OLD.status = 'draft', so this
-- trigger does NOT fire on it — Send still writes status/sent_at/first_sent_at
-- and the render snapshot. Revise creates a brand-new draft and never edits the
-- sent row, so it is unaffected.
--
-- Idempotent: create-or-replace function, drop-then-create trigger.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.lock_sent_invoice_fields()
returns trigger
language plpgsql
as $$
begin
  -- Document money
  NEW.subtotal       := OLD.subtotal;
  NEW.tax_rate       := OLD.tax_rate;
  NEW.tax_amount     := OLD.tax_amount;
  NEW.total          := OLD.total;
  -- Billed party (snapshot)
  NEW.client_name    := OLD.client_name;
  NEW.client_address := OLD.client_address;
  NEW.client_phone   := OLD.client_phone;
  -- Notes + deposit terms + due date
  NEW.notes          := OLD.notes;
  NEW.deposit_type   := OLD.deposit_type;
  NEW.deposit_value  := OLD.deposit_value;
  NEW.due_date       := OLD.due_date;
  -- First-sent stamp is immutable once set
  NEW.first_sent_at  := OLD.first_sent_at;
  -- Render snapshot — frozen record of what was actually sent
  NEW.template         := OLD.template;
  NEW.brand_colors     := OLD.brand_colors;
  NEW.background_color := OLD.background_color;
  NEW.business_name    := OLD.business_name;
  NEW.logo_url         := OLD.logo_url;
  NEW.website_url      := OLD.website_url;
  NEW.slogan           := OLD.slogan;
  NEW.cashapp_tag      := OLD.cashapp_tag;
  NEW.paypal_me        := OLD.paypal_me;
  NEW.venmo_username   := OLD.venmo_username;
  return NEW;
end $$;

drop trigger if exists lock_sent_invoice_fields on public.invoices;
create trigger lock_sent_invoice_fields
  before update on public.invoices
  for each row
  when (old.status <> 'draft')
  execute function public.lock_sent_invoice_fields();
