-- ═══════════════════════════════════════════════════════════════
-- Pay page bank transfer row (BANK-TRANSFER-SPEC.md, commit 2).
--
-- A NEW service-role RPC, separate from get_public_invoice(), so that
-- function's signature and return type stay untouched (changing them would
-- be a drop + create, i.e. a main-only migration). The pay page calls both.
--
-- Returns one row of bank details ONLY when all of these hold, in SQL:
--   • the token matches a non-deleted invoice (kind 'invoice', not a quote)
--   • status is sent or overdue — so never draft, paid or void
--   • something is still owed: amount_paid < total
--   • the pro has bank transfer switched on (bank_transfer_enabled true;
--     profiles_bank_enabled_complete guarantees every field is present)
-- Otherwise zero rows. The account number is decrypted here with p_key
-- (ZELLE_ENC_KEY, server-side only): the payer has to copy it, so the full
-- number is in the response; masking on the page is display-only.
--
-- SECURITY DEFINER, search_path '', EXECUTE for service_role only — the same
-- shape as get_public_invoice. Additive (new function only). Idempotent.
-- Verify after applying: npm run db:privcheck — Y1–Y4 must PASS.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.get_public_invoice_bank(p_token text, p_key text)
returns table (
  holder_name  text,
  bank_name    text,
  routing      text,
  account      text,
  account_type text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.bank_holder_name,
    p.bank_name,
    p.bank_routing,
    extensions.pgp_sym_decrypt(p.bank_account_enc, p_key),
    p.bank_account_type
  from public.invoices i
  join public.profiles p on p.id = i.user_id
  where i.public_token = p_token
    and i.kind = 'invoice'
    and i.status in ('sent', 'overdue')
    and i.deleted_at is null
    and coalesce(i.amount_paid, 0) < i.total
    and p.bank_transfer_enabled is true
    and p.bank_account_enc is not null;
$$;

revoke execute on function public.get_public_invoice_bank(text, text)
  from public, anon, authenticated;
grant execute on function public.get_public_invoice_bank(text, text)
  to service_role;
