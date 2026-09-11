-- ═══════════════════════════════════════════════════════════════
-- Exclude soft-deleted invoices from the public share/pay path.
--
-- 20260905000000_soft_delete added invoices.deleted_at, but
-- get_public_invoice() still resolved by public_token alone. A
-- deleted invoice's share link would continue to render and accept
-- payment. Adds the deleted_at guard; body otherwise unchanged from
-- 20260901120000.
--
-- Applied manually to production on 2026-09-10.
-- MUST run AFTER 20260905000000_soft_delete.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.get_public_invoice(p_token text, p_key text)
returns table (
  business_name   text,
  logo_url        text,
  invoice_number  int,
  kind            text,
  line_items      jsonb,
  total           numeric,
  status          text,
  paypal_me       text,
  cashapp_tag     text,
  venmo_username  text,
  zelle           text
)
language sql stable security definer set search_path = public, extensions as $$
  select
    p.business_name,
    p.logo_url,
    i.invoice_number,
    i.kind,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'description', elem->>'description',
        'qty',         elem->'qty',
        'unit_price',  elem->'unit_price'
      ))
      from jsonb_array_elements(i.line_items) as elem
    ), '[]'::jsonb) as line_items,
    i.total,
    i.status,
    p.paypal_me,
    p.cashapp_tag,
    p.venmo_username,
    case when p.zelle_info_enc is not null
         then pgp_sym_decrypt(p.zelle_info_enc, p_key)
         else null end as zelle
  from invoices i
  join profiles p on p.id = i.user_id
  where i.public_token = p_token
    and i.status <> 'draft'
    and i.deleted_at is null;
$$;

revoke execute on function public.get_public_invoice(text, text)
  from public, anon, authenticated;
grant execute on function public.get_public_invoice(text, text)
  to service_role;
