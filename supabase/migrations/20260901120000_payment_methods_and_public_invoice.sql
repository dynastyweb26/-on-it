-- ═══════════════════════════════════════════════════════════════
-- Payment methods (Venmo) + public shareable invoice read path.
--
-- Adds:
--   • profiles.venmo_username — third display-only payment handle,
--     same style/cap as cashapp_tag / paypal_me.
--   • invoices.public_token — an unguessable bearer token that lets a
--     finalized (non-draft) invoice be fetched WITHOUT auth, via the
--     service-role-only get_public_invoice() reader.
--
-- STATEMENT ORDER IS LOAD-BEARING. The finalized-rows CHECK
-- (status='draft' OR public_token IS NOT NULL) is added LAST, AFTER the
-- backfill has stamped a token onto every existing row — otherwise it
-- would abort immediately on any already-finalized invoice that predates
-- this migration. Column → token generator → trigger → BACKFILL →
-- constraint, in that order.
--
-- Security notes:
--   • public_token is a 128-bit random bearer token (gen_random_bytes),
--     NOT gen_referral_code()'s random()-based PRNG. random() is fine for
--     a short human-readable referral code; it is unacceptable for a
--     credential that grants read access to an invoice.
--   • get_public_invoice() is service_role-only and returns an EXPLICIT
--     column whitelist. It never selects *, never leaks the owner
--     (user_id), the client PII (name/email/phone/address), finalize_key,
--     notes, or the money math (subtotal/tax_*). line_items is
--     RE-PROJECTED to {description, qty, unit_price} so the passive
--     original_description training signal cannot escape to the public.
--   • Zelle is decrypted inline via pgp_sym_decrypt(zelle_info_enc,
--     p_key) — identical to get_zelle()'s one-expression body — guarded
--     so a null ciphertext stays null. Inlining removes the cross-
--     function grant dependency on get_zelle().
--
-- Idempotent: add-column-if-not-exists, drop-then-add for named
-- constraints, create-index-if-not-exists, or-replace functions,
-- drop-then-create trigger. A re-run backfills only still-null tokens.
-- ═══════════════════════════════════════════════════════════════

-- 1 ── profiles: Venmo handle (display-only, same cap as cashapp_tag) ─
alter table public.profiles
  add column if not exists venmo_username text
    check (venmo_username is null or char_length(venmo_username) <= 60);

-- 2 ── invoices: public_token column (nullable for now; check comes next)
alter table public.invoices
  add column if not exists public_token text;

-- 3 ── length cap on the token (drop-then-add so a re-run is clean) ───
alter table public.invoices
  drop constraint if exists invoices_public_token_len;
alter table public.invoices
  add constraint invoices_public_token_len
    check (public_token is null or char_length(public_token) <= 32);

-- 4 ── partial unique index: tokens are globally unique when present ──
create unique index if not exists invoices_public_token_key
  on public.invoices (public_token)
  where public_token is not null;

-- 5 ── token generator: 128 bits, base64url, padding stripped ────────
-- gen_random_bytes(16) = 128 bits of CSPRNG entropy (pgcrypto), base64url
-- encoded (+/ → -_, '=' removed) → 22 url-safe chars. Loops on the (near-
-- impossible) collision. NOT random(): this is a bearer credential.
-- search_path includes extensions so gen_random_bytes resolves; runs
-- inside the security-definer insert trigger, so the uniqueness SELECT
-- bypasses RLS and sees every row (the unique index is the hard backstop).
create or replace function public.gen_invoice_token() returns text
language plpgsql volatile set search_path = public, extensions as $$
declare
  tok text;
begin
  loop
    tok := replace(
             translate(encode(gen_random_bytes(16), 'base64'), '+/', '-_'),
             '=', '');
    exit when not exists (select 1 from invoices where public_token = tok);
  end loop;
  return tok;
end $$;
revoke execute on function public.gen_invoice_token() from anon, authenticated;

-- 6 ── before-insert trigger: stamp a token on every new invoice ─────
-- Same shape as set_referral_code (security definer) so gen_invoice_token
-- runs with RLS bypassed for its uniqueness check.
create or replace function public.set_invoice_token() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.public_token is null then
    new.public_token := gen_invoice_token();
  end if;
  return new;
end $$;
drop trigger if exists invoices_public_token on public.invoices;
create trigger invoices_public_token before insert on public.invoices
  for each row execute function public.set_invoice_token();

-- 7 ── BACKFILL: give every pre-existing invoice a token ─────────────
-- MUST run before the finalized-rows constraint below.
update public.invoices
  set public_token = gen_invoice_token()
  where public_token is null;

-- 8 ── finalized rows must carry a token (added LAST — see header) ───
alter table public.invoices
  drop constraint if exists invoices_finalized_has_token;
alter table public.invoices
  add constraint invoices_finalized_has_token
    check (status = 'draft' or public_token is not null);

-- 9 ── public reader: explicit whitelist, service_role only ──────────
-- Fetches a single finalized invoice by its bearer token. Returns ONLY
-- the fields the public payment page needs. line_items is re-projected
-- (original_description dropped). Zelle decrypted inline, null-guarded.
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
    -- RE-PROJECT each line item to description/qty/unit_price only.
    -- -> (not ->>) on qty/unit_price preserves their JSON numeric type;
    -- original_description is intentionally not carried through.
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
    and i.status <> 'draft';
$$;

-- 10 ── grants: service_role only, never public/anon/authenticated ───
revoke execute on function public.get_public_invoice(text, text)
  from public, anon, authenticated;
grant execute on function public.get_public_invoice(text, text)
  to service_role;
