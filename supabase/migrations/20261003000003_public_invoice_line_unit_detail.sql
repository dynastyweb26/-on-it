-- ═══════════════════════════════════════════════════════════════
-- Pay page shows line units and descriptions (UI redesign merge 2 · 2·7,
-- UI-REDESIGN-AUDIT §3 C).
--
-- No table change: unit and detail live inside each invoices.line_items
-- element (saved products, merge 2 · 2·9). get_public_invoice() — the public
-- pay-page RPC — passes them through alongside description / qty /
-- unit_price:
--   'unit'   only when it is one of each / hour / sq ft / job, else null;
--   'detail' text capped at 300 characters, else null.
-- Everything else is unchanged: same signature and return type (so CREATE OR
-- REPLACE, no drop), SECURITY DEFINER, search_path '', drafts and deleted
-- invoices excluded, EXECUTE for service_role only (re-asserted below).
-- Older lines without unit / detail return nulls, which the pay page ignores.
--
-- Sorts before 20261005000000_payment_reversals. Idempotent.
-- Verify after applying: npm run db:privcheck — H, I and S1 must PASS.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.get_public_invoice(p_token text, p_key text)
returns table (
  business_name text, logo_url text, invoice_number integer, kind text, line_items jsonb,
  subtotal numeric, tax_rate numeric, tax_amount numeric, total numeric,
  deposit_type text, deposit_value numeric, deposit_amount numeric, amount_paid numeric,
  status text, paypal_me text, cashapp_tag text, venmo_username text, zelle text,
  card_available boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.business_name,
    p.logo_url,
    i.invoice_number,
    i.kind,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'description', elem->>'description',
        'qty',         elem->'qty',
        'unit_price',  elem->'unit_price',
        'unit',        case when elem->>'unit' in ('each', 'hour', 'sq ft', 'job') then elem->>'unit' end,
        'detail',      left(nullif(btrim(elem->>'detail'), ''), 300)
      ))
      from jsonb_array_elements(i.line_items) as elem
    ), '[]'::jsonb) as line_items,
    i.subtotal,
    i.tax_rate,
    i.tax_amount,
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
         then extensions.pgp_sym_decrypt(p.zelle_info_enc, p_key)
         else null end as zelle,
    (p.stripe_account_id is not null
      and p.stripe_charges_enabled
      and p.card_payments_enabled) as card_available
  from public.invoices i
  join public.profiles p on p.id = i.user_id
  where i.public_token = p_token
    and i.status <> 'draft'
    and i.deleted_at is null;
$$;

revoke execute on function public.get_public_invoice(text, text)
  from public, anon, authenticated;
grant execute on function public.get_public_invoice(text, text)
  to service_role;
