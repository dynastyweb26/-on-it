-- ═══════════════════════════════════════════════════════════════
-- Explicit invoice color roles (Background / Accent / Secondary).
--
-- Settings now writes profiles.brand_colors in ROLE order
-- [background, accent, secondary?] and sets color_roles_explicit = true, so the
-- preview and the generated PDF can honor the roles the user actually picked.
-- Legacy profiles stay false (the column default), and invoice snapshots stay
-- null/false, so buildTheme() keeps its original luminance/saturation scoring
-- for old invoices. Additive only; no backfill.
--
-- invoices.color_roles_explicit is nullable: a null/false value means the row
-- was snapshotted before explicit roles existed (legacy scoring), while true
-- means brand_colors is in role order.
--
-- Grants: profiles revoked table-level UPDATE in 20260723130946 and grants it
-- back per column, so the new column needs its own grant. invoices still has
-- table-level UPDATE (see 20260904120000), so it needs no per-column grant.
--
-- The two functions below are restated only to carry the new flag through the
-- existing sent-invoice lock and the draft-paid-before-Send snapshot path.
-- Their behavior is otherwise unchanged.
--
-- Idempotent: add-column-if-not-exists, idempotent grant, create-or-replace.
-- ═══════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists color_roles_explicit boolean not null default false;

grant update (color_roles_explicit) on public.profiles to authenticated;

alter table public.invoices
  add column if not exists color_roles_explicit boolean;

-- Pin the flag with the rest of a sent invoice's render snapshot.
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
  return NEW;
end $$;

-- Copy the flag when a draft is paid before Send (restated from
-- 20261018000000; only color_roles_explicit is new).
create or replace function public.reconcile_invoice_from_ledger(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv      record;
  v_paid     numeric;
  v_refunded numeric;
  v_max      timestamptz;
  v_full     boolean;
  v_leave    boolean;
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

  select
    coalesce(sum(p.amount) filter (where p.entry_type <> 'refund'), 0),
    coalesce(-sum(p.amount) filter (where p.entry_type = 'refund'), 0),
    max(p.paid_at) filter (where p.entry_type <> 'refund' and p.amount > 0)
    into v_paid, v_refunded, v_max
    from public.invoice_payments p
    where p.invoice_id = p_invoice_id;

  v_full  := v_inv.total > 0 and v_paid >= v_inv.total;
  v_leave := v_inv.status = 'draft' and v_inv.kind = 'invoice' and v_paid > 0;

  -- Render snapshot while still a draft (see 20260930000002).
  if v_leave and v_inv.template is null then
    update public.invoices i
    set
      template             = pr.invoice_template,
      brand_colors         = pr.brand_colors,
      background_color     = pr.background_color,
      color_roles_explicit = pr.color_roles_explicit,
      business_name        = pr.business_name,
      logo_url             = pr.logo_url,
      website_url          = pr.website_url,
      slogan               = pr.slogan,
      cashapp_tag          = pr.cashapp_tag,
      paypal_me            = pr.paypal_me,
      venmo_username       = pr.venmo_username
    from public.profiles pr
    where i.id = p_invoice_id
      and pr.id = i.user_id;
  end if;

  update public.invoices i
  set
    amount_paid     = v_paid,
    refunded_amount = v_refunded,
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

revoke execute on function public.reconcile_invoice_from_ledger(uuid)
  from public, anon, authenticated;
