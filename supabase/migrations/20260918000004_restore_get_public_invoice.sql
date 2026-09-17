-- ═══════════════════════════════════════════════════════════════
-- Restore public.get_public_invoice after the 20260918000002 drift.
--
-- 20260918000002_get_public_invoice_duenow ran an UNCONDITIONAL
--   drop function if exists public.get_public_invoice(text, text)
-- before its create. When it was hand-applied in the SQL editor the
-- create failed (the deposit_amount / amount_paid columns it returns
-- were not present at that moment), so the DROP committed and the
-- function was left dropped in production. No app path calls it today
-- (there is no /pay route; /i/[token] is referral-only), so nothing
-- live is broken — but any `supabase db push` and the eventual pay page
-- would fail.
--
-- This migration re-creates the function CREATE-ONLY (no drop), with the
-- same signature and body intent as 20260918000002 (deposit + payment
-- return fields) plus the deleted_at guard from 20260910000000. It is
-- replay-safe via `create or replace`: it succeeds whether the function
-- is absent (production today) or already present (a local `db reset`
-- that replays 000002 successfully). The signature is byte-identical to
-- 000002's, so a replace never hits a return-type change.
--
-- Hardened over the originals: `set search_path = ''` with EVERY object
-- schema-qualified (public.invoices, public.profiles,
-- extensions.pgp_sym_decrypt), so name resolution cannot be steered by a
-- caller's search_path — the correct posture for a security-definer
-- function. Built-ins (jsonb_agg / jsonb_build_object /
-- jsonb_array_elements, coalesce, casts, operators) resolve from
-- pg_catalog, which is always searched regardless of search_path.
--
-- Grants per 20260901120000: service_role only; never public / anon /
-- authenticated.
--
-- Every referenced column is created by an existing migration:
--   profiles.business_name, logo_url, zelle_info_enc   001_init
--   profiles.paypal_me, cashapp_tag                    (pre-existing)
--   profiles.venmo_username                            20260901120000
--   invoices.invoice_number, kind, line_items, total,
--     status, user_id, public_token                    001_init / 20260901120000
--   invoices.deleted_at                                20260905000000
--   invoices.deposit_type, deposit_value               20260915000000
--   invoices.deposit_amount, amount_paid               20260916000000
--   extensions.pgp_sym_decrypt (pgcrypto)              001_init
-- ═══════════════════════════════════════════════════════════════

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
