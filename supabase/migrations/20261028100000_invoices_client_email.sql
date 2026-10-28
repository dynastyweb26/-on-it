-- ═══════════════════════════════════════════════════════════════
-- invoices.client_email — the billed party's email, snapshotted like the
-- address and phone beside it.
--
-- Chat already captures the client's phone and address and prints them in the
-- PDF's client block. Email was dropped on the floor because there was nowhere
-- to store it. This adds the column (nullable, additive) and pins it exactly
-- like client_phone:
--   • lock_sent_invoice_fields freezes it once the row leaves draft, rebuilt
--     below from its latest body (20261023100200_estimates_title_caption_contact.sql).
--   • guard_locked_estimate_edits lets it stay editable on a sent-unsigned
--     estimate and refuses the change once signed/converted, rebuilt from its
--     latest body (20261023100200_estimates_title_caption_contact.sql).
--
-- No backfill: existing rows stay NULL and print nothing (the PDF renders the
-- line only when a value is present). No client UI writes it yet.
--
-- `invoices` still carries table-level UPDATE (20260904120000), so the new
-- column needs no per-column grant. Idempotent: add-column-if-not-exists,
-- drop-then-create constraint, create-or-replace functions.
-- ═══════════════════════════════════════════════════════════════

alter table public.invoices
  add column if not exists client_email text;

alter table public.invoices drop constraint if exists invoices_client_email_len_chk;
alter table public.invoices add constraint invoices_client_email_len_chk
  check (client_email is null or char_length(client_email) <= 254);

comment on column public.invoices.client_email is
  'Billed party email, captured only when the owner states it. Snapshotted with client_address/client_phone; NULL prints nothing.';

-- ── 1. Sent-invoice lock: pin the email with the rest of the billed party ──
-- Source: the live body from 20261023100200_estimates_title_caption_contact.sql
-- (the latest rebuild; 20261023100100 introduced the sent-quote window), with
-- only the client_email pin added.
create or replace function public.lock_sent_invoice_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- First-sent stamp is immutable once set
  NEW.first_sent_at        := OLD.first_sent_at;
  -- Render snapshot — frozen record of what was actually sent. The COLOR-FOR-
  -- ROLES flag (20261020120000) belongs here: without it a re-render could
  -- rescore an old invoice's colors.
  NEW.template             := OLD.template;
  NEW.brand_colors         := OLD.brand_colors;
  NEW.background_color     := OLD.background_color;
  NEW.color_roles_explicit := OLD.color_roles_explicit;
  NEW.business_name        := OLD.business_name;
  NEW.logo_url             := OLD.logo_url;
  NEW.website_url          := OLD.website_url;
  NEW.slogan               := OLD.slogan;
  NEW.cashapp_tag          := OLD.cashapp_tag;
  NEW.paypal_me            := OLD.paypal_me;
  NEW.venmo_username       := OLD.venmo_username;

  -- A sent, unsigned, unconverted quote keeps editable CONTENT. Everything
  -- else — invoices, approved/converted quotes, drafts, paid/overdue/void —
  -- falls through to today's pins.
  if OLD.kind = 'quote'
     and OLD.status = 'sent'
     and OLD.approved_at is null
     and not exists (
       select 1 from public.invoices i
        where i.converted_from = OLD.id
          and i.deleted_at is null
     )
  then
    return NEW;
  end if;

  -- Document money
  NEW.subtotal       := OLD.subtotal;
  NEW.tax_rate       := OLD.tax_rate;
  NEW.tax_amount     := OLD.tax_amount;
  NEW.total          := OLD.total;
  -- Billed party (snapshot)
  NEW.client_name    := OLD.client_name;
  NEW.client_address := OLD.client_address;
  NEW.client_phone   := OLD.client_phone;
  NEW.client_email   := OLD.client_email;
  -- Heading (content snapshot)
  NEW.title          := OLD.title;
  -- Notes + deposit terms + due date
  NEW.notes          := OLD.notes;
  NEW.deposit_type   := OLD.deposit_type;
  NEW.deposit_value  := OLD.deposit_value;
  NEW.due_date       := OLD.due_date;
  return NEW;
end $$;


-- ── 2. Estimate edit window: email behaves like the phone beside it ──
create or replace function public.guard_locked_estimate_edits()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return NEW;
  end if;
  if OLD.kind <> 'quote' then
    return NEW;
  end if;
  if OLD.approved_at is null
     and not exists (
       select 1 from public.invoices i
        where i.converted_from = OLD.id
          and i.deleted_at is null
     )
  then
    return NEW;
  end if;

  if NEW.line_items is distinct from OLD.line_items
     or NEW.subtotal is distinct from OLD.subtotal
     or NEW.tax_rate is distinct from OLD.tax_rate
     or NEW.tax_amount is distinct from OLD.tax_amount
     or NEW.total is distinct from OLD.total
     or NEW.notes is distinct from OLD.notes
     or NEW.client_name is distinct from OLD.client_name
     or NEW.client_address is distinct from OLD.client_address
     or NEW.client_phone is distinct from OLD.client_phone
     or NEW.client_email is distinct from OLD.client_email
     or NEW.title is distinct from OLD.title
  then
    raise exception 'A signed or converted estimate cannot be changed'
      using errcode = 'insufficient_privilege',
            hint = 'Create a new estimate instead of editing this one.';
  end if;
  return NEW;
end $$;

revoke execute on function public.guard_locked_estimate_edits()
  from public, anon, authenticated;
