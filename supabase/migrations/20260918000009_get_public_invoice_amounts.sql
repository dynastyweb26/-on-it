-- ═══════════════════════════════════════════════════════════════
-- Widen get_public_invoice to return the money breakdown: subtotal,
-- tax_rate, tax_amount.
--
-- WHY: the public pay page shows line items + a "Total due", but the
-- whitelist omitted subtotal/tax, so a tax-bearing invoice looked wrong
-- (items sum to $500, total reads $540, nothing explains the $40). These
-- three figures are ALREADY printed on the PDF the client receives, so
-- returning them is NOT new exposure. The rest of the whitelist is
-- unchanged: still NO user_id, no client PII, no notes, no finalize_key;
-- line_items still re-projected to {description, qty, unit_price}.
--
-- Adding return columns changes the function's RETURN TYPE, which
-- `create or replace` cannot do — so this DROPs then re-creates. Under
-- `supabase db push` each migration file runs in a transaction, so the
-- drop+create is ATOMIC (a failed create rolls back the drop). Do NOT
-- hand-run only the DROP in the SQL editor — that is exactly the
-- 20260918000002 drift that left the function dropped in production (see
-- 20260918000004). Run the whole file, or `db push`.
--
-- SHARED DATABASE: preview and production point at the same Supabase
-- project, so applying this migration takes effect in production
-- immediately. The pay-page frontend tolerates its absence (renders no
-- breakdown when tax_amount is absent/0), so the code can deploy first.
--
-- Hardened as in 20260918000004: `set search_path = ''`, every object
-- schema-qualified, service_role-only grants. subtotal/tax_rate/tax_amount
-- are 001_init columns (numeric, not null, default 0) — always present.
-- ═══════════════════════════════════════════════════════════════

drop function if exists public.get_public_invoice(text, text);
create function public.get_public_invoice(p_token text, p_key text)
returns table (
  business_name   text,
  logo_url        text,
  invoice_number  int,
  kind            text,
  line_items      jsonb,
  subtotal        numeric,
  tax_rate        numeric,
  tax_amount      numeric,
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
language sql stable security definer set search_path = '' as $$
  select
    p.business_name,
    p.logo_url,
    i.invoice_number,
    i.kind,
    -- Re-project each line item to description/qty/unit_price only;
    -- original_description is intentionally not carried through. -> (not
    -- ->>) on qty/unit_price preserves their JSON numeric type.
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'description', elem->>'description',
        'qty',         elem->'qty',
        'unit_price',  elem->'unit_price'
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
         else null end as zelle
  from public.invoices i
  join public.profiles p on p.id = i.user_id
  where i.public_token = p_token
    and i.status <> 'draft'
    and i.deleted_at is null;
$$;

-- Grants: service_role only, never public / anon / authenticated.
revoke execute on function public.get_public_invoice(text, text)
  from public, anon, authenticated;
grant execute on function public.get_public_invoice(text, text)
  to service_role;
