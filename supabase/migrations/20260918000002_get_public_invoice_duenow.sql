-- Update get_public_invoice to return deposit and payment columns
create or replace function public.get_public_invoice(p_token text, p_key text)
returns table (
  business_name   text,
  logo_url        text,
  invoice_number  int,
  kind            text,
  line_items      jsonb,
  total           numeric,
  deposit_type    text,
  deposit_value   numeric,
  deposit_amount  numeric,
  amount_paid     numeric,
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
    i.deposit_type,
    i.deposit_value,
    i.deposit_amount,
    i.amount_paid,
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
