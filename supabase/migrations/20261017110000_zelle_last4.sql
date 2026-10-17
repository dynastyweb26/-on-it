-- ═══════════════════════════════════════════════════════════════
-- profiles.zelle_last4 — non-secret mask so Settings renders with no fetch
-- ADDITIVE: one new nullable column + a check on that new column + a
-- create-or-replace of set_zelle (same signature, same grants). Safe to push
-- from a feature branch (main ignores the column; old set_zelle callers keep
-- working). Needs the full dry run / SQL / yes / privilege check.
--
-- Meaning (matches the mask the app already shows, ••••<last 4 chars>):
--   NULL          nothing stored, OR stored before this column existed
--                 (the app tells these apart by zelle_info_enc and backfills)
--   ''            stored, but 4 characters or fewer: the mask is plain ••••
--   'abcd'        the last 4 characters of the stored phone/email
--
-- Backfill is NOT done in this file. Decrypting needs ZELLE_ENC_KEY, which
-- lives in the app's environment and is never in the database, so SQL cannot
-- read the old values. GET /api/zelle (already decrypts server-side) writes
-- the mask the first time an existing user's Settings loads; see the route.
--
-- Written only by set_zelle() and by /api/zelle on the service role. NOT in
-- the 20260925000001 grant-back list, so `authenticated` cannot update it.
-- ═══════════════════════════════════════════════════════════════
alter table public.profiles
  add column if not exists zelle_last4 text;

do $$
begin
  if not exists (select 1 from pg_constraint
      where conname = 'profiles_zelle_last4_len' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_zelle_last4_len
      check (zelle_last4 is null or char_length(zelle_last4) <= 4);
  end if;
end $$;

-- Same signature as 001_init.sql, so the 20261015000001 grants (service_role
-- only) carry over untouched. Encrypts as before and now stamps the mask.
create or replace function public.set_zelle(p_user uuid, p_value text, p_key text)
returns void language sql security definer set search_path = public, extensions as $$
  update profiles set
    zelle_info_enc = pgp_sym_encrypt(p_value, p_key),
    zelle_last4    = case when char_length(p_value) <= 4 then '' else right(p_value, 4) end
  where id = p_user;
$$;
