-- ═══════════════════════════════════════════════════════════════
-- Bank transfer / direct deposit (BANK-TRANSFER-SPEC.md, commit 1).
--
-- US ACH details the pro enters in Settings, shown to the payer on the pay
-- page (commit 2). On It never moves or detects the money.
--
-- Stored on profiles next to the other payment methods. The account number
-- follows the Zelle pattern (SECURITY.md layer 5): pgcrypto-encrypted at rest
-- in bank_account_enc, key server-side only (ZELLE_ENC_KEY, passed in by
-- /api/bank). bank_account_last4 is kept in clear so Settings can show
-- ••••4417 without decrypting.
--
-- Write path: ONLY /api/bank → the service-role functions below. None of the
-- new columns is granted to authenticated (privilege check B lists them as
-- privileged), so a direct PostgREST PATCH can't skip validation. Reads stay
-- owner-only through the existing "own profile" RLS policy.
--
-- Validation is enforced here as well as in the app:
--   • routing: 9 digits + ABA checksum — CHECK profiles_bank_routing_aba,
--     written inline (no helper function) so ordinary profile updates by
--     authenticated need no extra function grant
--   • account: 4–17 digits (checked in set_bank_transfer before encrypting)
--   • enabled only when every field is present (CHECK constraint)
--
-- log_audit() is re-created to drop bank_account_enc from audit detail, the
-- same way it already drops zelle_info_enc. On rows without the column the
-- extra "- 'bank_account_enc'" is a no-op.
--
-- Additive: new nullable columns, checks on those new columns only, new
-- functions. Idempotent. Verify after applying: npm run db:privcheck — B and
-- X1–X4 must PASS.
-- ═══════════════════════════════════════════════════════════════

-- 1 ── profiles: bank columns ─────────────────────────────────────
alter table public.profiles
  add column if not exists bank_holder_name      text,
  add column if not exists bank_name             text,
  add column if not exists bank_routing          text,
  add column if not exists bank_account_enc      bytea,
  add column if not exists bank_account_last4    text,
  add column if not exists bank_account_type     text,
  add column if not exists bank_transfer_enabled boolean;

do $$
begin
  if not exists (select 1 from pg_constraint
      where conname = 'profiles_bank_holder_name_len' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_bank_holder_name_len
      check (bank_holder_name is null or char_length(bank_holder_name) between 1 and 100);
  end if;
  if not exists (select 1 from pg_constraint
      where conname = 'profiles_bank_name_len' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_bank_name_len
      check (bank_name is null or char_length(bank_name) between 1 and 100);
  end if;
  -- ABA: (3*(d1+d4+d7) + 7*(d2+d5+d8) + (d3+d6+d9)) % 10 = 0. CASE so the
  -- digit casts only run once the 9-digit format is confirmed.
  if not exists (select 1 from pg_constraint
      where conname = 'profiles_bank_routing_aba' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_bank_routing_aba
      check (bank_routing is null or case
        when bank_routing ~ '^[0-9]{9}$' then
          (3 * (substr(bank_routing,1,1)::int + substr(bank_routing,4,1)::int + substr(bank_routing,7,1)::int)
         + 7 * (substr(bank_routing,2,1)::int + substr(bank_routing,5,1)::int + substr(bank_routing,8,1)::int)
         +     (substr(bank_routing,3,1)::int + substr(bank_routing,6,1)::int + substr(bank_routing,9,1)::int)) % 10 = 0
        else false end);
  end if;
  if not exists (select 1 from pg_constraint
      where conname = 'profiles_bank_account_last4_fmt' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_bank_account_last4_fmt
      check (bank_account_last4 is null or bank_account_last4 ~ '^[0-9]{4}$');
  end if;
  if not exists (select 1 from pg_constraint
      where conname = 'profiles_bank_account_type_chk' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_bank_account_type_chk
      check (bank_account_type is null or bank_account_type in ('checking', 'savings'));
  end if;
  if not exists (select 1 from pg_constraint
      where conname = 'profiles_bank_enabled_complete' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_bank_enabled_complete
      check (bank_transfer_enabled is not true or (
        bank_holder_name is not null and bank_name is not null and bank_routing is not null
        and bank_account_enc is not null and bank_account_last4 is not null
        and bank_account_type is not null));
  end if;
end $$;

-- Clients never write these columns. profiles has no table-level UPDATE or
-- INSERT for anon/authenticated (20260723130946), so new columns start
-- unwritable; this makes it explicit and keeps it true if a stray grant
-- ever lands. Privilege checks B and X4 verify it.
revoke update (bank_holder_name, bank_name, bank_routing, bank_account_enc,
               bank_account_last4, bank_account_type, bank_transfer_enabled)
  on public.profiles from anon, authenticated;
revoke insert (bank_holder_name, bank_name, bank_routing, bank_account_enc,
               bank_account_last4, bank_account_type, bank_transfer_enabled)
  on public.profiles from anon, authenticated;

-- 2 ── Write functions (service_role only, via /api/bank) ─────────
-- Save details. p_account null = keep the stored account number (editing
-- other fields doesn't require re-entering it). A bad account number raises
-- 22023; a bad routing number fails profiles_bank_routing_aba (23514).
create or replace function public.set_bank_transfer(
  p_user uuid, p_holder text, p_bank text, p_routing text,
  p_account text, p_type text, p_enabled boolean, p_key text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_account is not null and p_account !~ '^[0-9]{4,17}$' then
    raise exception 'invalid account number' using errcode = '22023';
  end if;
  update public.profiles set
    bank_holder_name      = p_holder,
    bank_name             = p_bank,
    bank_routing          = p_routing,
    bank_account_type     = p_type,
    bank_account_enc      = case when p_account is null then bank_account_enc
                                 else extensions.pgp_sym_encrypt(p_account, p_key) end,
    bank_account_last4    = case when p_account is null then bank_account_last4
                                 else right(p_account, 4) end,
    bank_transfer_enabled = p_enabled
  where id = p_user;
end $$;

create or replace function public.set_bank_transfer_enabled(p_user uuid, p_enabled boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set bank_transfer_enabled = p_enabled where id = p_user;
$$;

create or replace function public.clear_bank_transfer(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set
    bank_holder_name = null, bank_name = null, bank_routing = null,
    bank_account_enc = null, bank_account_last4 = null, bank_account_type = null,
    bank_transfer_enabled = null
  where id = p_user;
$$;

revoke execute on function public.set_bank_transfer(uuid, text, text, text, text, text, boolean, text) from public, anon, authenticated;
revoke execute on function public.set_bank_transfer_enabled(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.clear_bank_transfer(uuid) from public, anon, authenticated;
grant execute on function public.set_bank_transfer(uuid, text, text, text, text, text, boolean, text) to service_role;
grant execute on function public.set_bank_transfer_enabled(uuid, boolean) to service_role;
grant execute on function public.clear_bank_transfer(uuid) to service_role;

-- 3 ── Audit log: drop the encrypted account number too ───────────
-- Same body as 20260731000000, plus "- 'bank_account_enc'".
create or replace function public.log_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (user_id, table_name, action, row_id, detail)
  values (
    auth.uid(),
    tg_table_name,
    tg_op,
    coalesce(new.id, old.id),
    -- DELETE = account teardown: keep the event, drop the personal data.
    -- INSERT / UPDATE: unchanged — full row minus the encrypted Zelle handle.
    case
      when tg_op = 'DELETE' then jsonb_build_object('redacted', true)
      else to_jsonb(new) - 'zelle_info_enc' - 'bank_account_enc'
    end
  );
  return coalesce(new, old);
end $$;
