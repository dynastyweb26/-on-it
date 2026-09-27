-- ═══════════════════════════════════════════════════════════════
-- Pay with card — public-invoice RPC changes.
--
-- 1. get_public_invoice gains ONE column: card_available boolean. It is
--    display-only (the pay page shows or hides the "Pay with card" button).
--    It is true only when the seller has a connected account whose card
--    payments Stripe has enabled AND the seller opted in. The seller's
--    stripe_account_id and the raw flags are deliberately NOT returned —
--    this RPC's output is rendered to anonymous visitors.
--    (Whether Connect is switched on in the deployment, STRIPE_CONNECT_ENABLED,
--    isn't in the DB; the page ANDs that in server-side.)
--
-- 2. NEW get_public_invoice_checkout(p_token): service-role-only, used ONLY by
--    POST /api/pay/[token]/checkout to create a Stripe Checkout Session on the
--    seller's account. Returns what that route needs and nothing else,
--    including stripe_account_id — which never leaves the server. The route
--    re-checks every gate itself (charges enabled, opted in, status
--    sent/overdue, amount due > 0); card_available is never trusted.
--
-- Both: SECURITY DEFINER, `set search_path = ''`, every object schema-
-- qualified, drafts and soft-deleted invoices excluded, execute revoked from
-- public/anon/authenticated and granted to service_role only — the same
-- hardening as 20260918000004 / 20260918000009.
--
-- get_public_invoice's return type changes, so it is dropped and recreated in
-- this one migration (CREATE OR REPLACE can't change a return type). Apply the
-- whole file in one run. The page tolerates the column being absent
-- (card_available → false) if the app deploys first.
-- ═══════════════════════════════════════════════════════════════

-- 1 ── get_public_invoice + card_available
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
  zelle           text,
  card_available  boolean
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
         else null end as zelle,
    -- Display-only. No account id, no raw flags.
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

-- 2 ── get_public_invoice_checkout — server-only checkout inputs
drop function if exists public.get_public_invoice_checkout(text);
create function public.get_public_invoice_checkout(p_token text)
returns table (
  invoice_id              uuid,
  invoice_number          int,
  kind                    text,
  status                  text,
  business_name           text,
  total                   numeric,
  deposit_amount          numeric,
  amount_paid             numeric,
  stripe_account_id       text,
  stripe_charges_enabled  boolean,
  card_payments_enabled   boolean
)
language sql stable security definer set search_path = '' as $$
  select
    i.id,
    i.invoice_number,
    i.kind,
    i.status,
    p.business_name,
    i.total,
    i.deposit_amount,
    i.amount_paid,
    p.stripe_account_id,
    p.stripe_charges_enabled,
    p.card_payments_enabled
  from public.invoices i
  join public.profiles p on p.id = i.user_id
  where i.public_token = p_token
    and i.status <> 'draft'
    and i.deleted_at is null;
$$;

revoke execute on function public.get_public_invoice_checkout(text)
  from public, anon, authenticated;
grant execute on function public.get_public_invoice_checkout(text)
  to service_role;

-- ── Verification — run after applying ─────────────────────────
--
-- 1. Neither function is callable by anon/authenticated (expect all false):
-- select f, r,
--   has_function_privilege(r, f, 'execute') as can_execute
-- from (values ('public.get_public_invoice(text, text)'),
--              ('public.get_public_invoice_checkout(text)')) fn(f)
-- cross join (values ('anon'), ('authenticated')) ro(r);
--
-- 2. Both are SECURITY DEFINER with search_path '' (expect prosecdef true,
--    proconfig {search_path=""}):
-- select proname, prosecdef, proconfig from pg_proc
-- where proname in ('get_public_invoice', 'get_public_invoice_checkout');
--
-- 3. get_public_invoice's result ends with card_available and has no
--    stripe_account_id:
-- select pg_get_function_result('public.get_public_invoice(text,text)'::regprocedure);
