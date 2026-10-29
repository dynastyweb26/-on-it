-- ═══════════════════════════════════════════════════════════════
-- Freeze invoices.terms once a document has left draft.
--
-- invoices.terms is the send-time snapshot of the owner's terms printed on
-- every estimate and invoice. It was the one displayed field that escaped
-- both freeze triggers: lock_sent_invoice_fields() pinned money, billed
-- party, title, notes, deposit, due date and the render snapshot but never
-- terms, and guard_locked_estimate_edits() diffed the same set without it.
-- authenticated keeps table-level UPDATE with an owner-only RLS policy, so a
-- raw REST PATCH could rewrite contract text a client had already been shown
-- (or had signed), and estimate_content_hash does not cover terms, so the
-- change left no signal.
--
-- What this does:
--   • lock_sent_invoice_fields(): NEW.terms := OLD.terms, placed with the
--     other send-time pins (first_sent_at / render snapshot), so it applies
--     to every non-draft row — including the sent-but-unsigned quote window,
--     which stays editable for CONTENT (line items, notes, title) but never
--     for the terms snapshot. The trigger's WHEN (old.status <> 'draft')
--     means drafts never fire it, so terms stay freely editable before send.
--   • guard_locked_estimate_edits(): terms added to the post-signature
--     diff, so an authenticated client-role write on a signed or converted
--     estimate fails loudly with 42501 instead of being silently pinned.
--
-- NOT changed: estimate_content_hash (no hash change, no versioning).
--
-- App audit (2026-10-29): the only writer of invoices.terms is the first-send
-- patch (renderSnapshot -> termsSnapshot, src/lib/invoice-snapshot.ts), which
-- runs on the draft -> sent transition where this trigger does not fire.
-- Resends patch only sent_at (plus valid_until for estimates). Draft saves
-- touch draft rows, which the trigger skips. No legitimate path writes terms
-- after send.
--
-- Idempotent: create-or-replace of both functions, drop-then-create triggers.
-- Verify after applying (see the checks at the bottom).
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Sent-document lock: pin the terms snapshot ──────────────
-- Body is the live version from 20261028100000_invoices_client_email.sql,
-- with only the NEW.terms pin added.
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
  -- Terms snapshot (20261024100000): taken at first send, so the contract
  -- text a client was shown cannot be rewritten afterwards. Pinned here,
  -- above the sent-quote window, because it is a snapshot rather than
  -- editable content.
  NEW.terms                := OLD.terms;

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

-- Trigger functions are invoked by the table owner; clients never need EXECUTE.
revoke execute on function public.lock_sent_invoice_fields()
  from public, anon, authenticated;

drop trigger if exists lock_sent_invoice_fields on public.invoices;
create trigger lock_sent_invoice_fields
  before update on public.invoices
  for each row
  when (old.status <> 'draft')
  execute function public.lock_sent_invoice_fields();

-- ── 2. Post-signature guard: fail loudly on a terms change ─────
-- Body is the live version from 20261028100000_invoices_client_email.sql,
-- with only the terms comparison added.
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
     or NEW.terms is distinct from OLD.terms
  then
    raise exception 'A signed or converted estimate cannot be changed'
      using errcode = 'insufficient_privilege',
            hint = 'Create a new estimate instead of editing this one.';
  end if;
  return NEW;
end $$;

revoke execute on function public.guard_locked_estimate_edits()
  from public, anon, authenticated;

drop trigger if exists guard_locked_estimate_edits on public.invoices;
create trigger guard_locked_estimate_edits
  before update on public.invoices
  for each row
  execute function public.guard_locked_estimate_edits();

-- ── Verification — run after applying ─────────────────────────
-- 1. Drafts stay editable (expect success, terms changed):
--      update public.invoices set terms = 'Net 15' where id = '<draft id>';
--
-- 2. A sent document's terms cannot move (expect the stored value unchanged):
--      update public.invoices set terms = 'rewritten' where id = '<sent id>';
--      select terms from public.invoices where id = '<sent id>';
--
-- 3. A signed estimate rejects it for a client role (expect 42501):
--      set role authenticated;  -- with a request.jwt.claim.sub = the owner
--      update public.invoices set terms = 'rewritten' where id = '<signed id>';
--      reset role;
--
-- 4. Sending still records the terms: create a draft with terms, POST
--    /api/estimates/[id]/send (or /api/invoices/[id]/send), and confirm
--    invoices.terms holds the profile snapshot.
