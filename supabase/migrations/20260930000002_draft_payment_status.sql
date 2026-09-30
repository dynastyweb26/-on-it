-- ═══════════════════════════════════════════════════════════════
-- A payment on a draft invoice takes it out of draft.
--
-- reconcile_invoice_from_ledger (20260918000003) only re-statused sent/overdue
-- invoices, so a draft that was paid (typically a converted quote, which is
-- inserted as a draft and paid before anyone taps Send) stayed 'draft' forever:
-- no paid_at, still editable, missing from Paid. Money has changed hands, so the
-- client has the invoice. Now, for kind = 'invoice' drafts:
--   • fully paid (paid >= total, total > 0) → 'paid', paid_at = latest ledger paid_at
--   • partly paid (paid > 0)                → 'sent'
-- sent/overdue/paid rules are unchanged. Quotes and voids are never re-statused.
--
-- Leaving draft here does what Send does (invoices/[id] settleShare), so the row
-- matches a normally sent one:
--   • render snapshot: if the row has none (template is null — the app's
--     per-row sentinel), copy the ten render inputs from the owner's profile,
--     mirroring src/lib/invoice-snapshot.ts. Taken BEFORE the status change,
--     while the row is still a draft, because lock_sent_invoice_fields pins
--     these columns once status leaves draft. A row that already has a snapshot
--     keeps it (never mixed).
--   • first_sent_at is stamped by the existing set_first_sent_at trigger on the
--     draft → non-draft transition (coalesce(sent_at, now())). sent_at is left
--     as-is: nothing was shared. A partly paid row is therefore eligible for
--     /api/followups 2 days later, subject to its due date (fix/followup-due-date).
-- Not reverted: deleting every payment on a row this moved to 'sent' leaves it
-- 'sent' (it has left draft; content is locked). A 'paid' row that loses cover
-- still reverts to 'sent', as before.
--
-- Backfill: reconcile every live (not soft-deleted) draft invoice that already
-- has ledger rows.
--
-- Idempotent: create-or-replace function; the backfill only touches drafts,
-- and a reconciled draft with payments is no longer a draft.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.reconcile_invoice_from_ledger(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv   record;
  v_paid  numeric;
  v_max   timestamptz;
  v_full  boolean;
  v_leave boolean;
begin
  -- Lock the invoice first so concurrent ledger changes reconcile one at a time.
  select i.status, i.kind, i.total, i.template
    into v_inv
    from public.invoices i
    where i.id = p_invoice_id
    for update;
  if not found then
    return;
  end if;

  select coalesce(sum(p.amount), 0), max(p.paid_at)
    into v_paid, v_max
    from public.invoice_payments p
    where p.invoice_id = p_invoice_id;

  v_full  := v_inv.total > 0 and v_paid >= v_inv.total;
  v_leave := v_inv.status = 'draft' and v_inv.kind = 'invoice' and v_paid > 0;

  -- Render snapshot while still a draft (see header).
  if v_leave and v_inv.template is null then
    update public.invoices i
    set
      template         = pr.invoice_template,
      brand_colors     = pr.brand_colors,
      background_color = pr.background_color,
      business_name    = pr.business_name,
      logo_url         = pr.logo_url,
      website_url      = pr.website_url,
      slogan           = pr.slogan,
      cashapp_tag      = pr.cashapp_tag,
      paypal_me        = pr.paypal_me,
      venmo_username   = pr.venmo_username
    from public.profiles pr
    where i.id = p_invoice_id
      and pr.id = i.user_id;
  end if;

  update public.invoices i
  set
    amount_paid = v_paid,
    status = case
      when v_full and (i.status in ('sent', 'overdue') or v_leave) then 'paid'
      when v_leave                                                  then 'sent'
      when i.status = 'paid' and v_paid < i.total                   then 'sent'
      else i.status
    end,
    paid_at = case
      when v_full and (i.status in ('sent', 'overdue') or v_leave) then v_max
      when i.status = 'paid' and v_paid < i.total                   then null
      else i.paid_at
    end
  where i.id = p_invoice_id;
end;
$$;

-- Internal helper only — invoked by the SECURITY DEFINER ledger trigger and
-- migrations, never by clients. create-or-replace keeps the existing revoke;
-- restated so this file stands alone.
revoke execute on function public.reconcile_invoice_from_ledger(uuid)
  from public, anon, authenticated;

-- Backfill: live draft invoices that already have payments.
select public.reconcile_invoice_from_ledger(i.id)
from public.invoices i
where i.status = 'draft'
  and i.kind = 'invoice'
  and i.deleted_at is null
  and exists (select 1 from public.invoice_payments p where p.invoice_id = i.id);

-- Verification — run after applying (also section M of
-- supabase/snippets/privilege_check.sql).
--
-- select
--   count(*) filter (where status = 'draft' and kind = 'invoice' and deleted_at is null
--                      and amount_paid > 0)                                   as paid_drafts_left,
--   count(*) filter (where status = 'paid' and amount_paid < total)           as paid_but_underpaid
-- from public.invoices;
-- Expect 0 / 0.
