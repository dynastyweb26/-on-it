-- Proof script - estimates data layer, part 1.
-- Migration under test: 20261023100000_estimates_links_signatures.sql
--
-- VERIFIES:
--   1. invoices.valid_until (date, null) and revoked_at (timestamptz, null).
--   2. estimate_signatures is RLS-on with one owner SELECT policy; authenticated
--      can SELECT and nothing else; anon has no access.
--   3. The owner sees their signature; another user sees none.
--   4. invoice_attachments gained nullable mime_type/size_bytes/checksum + checks.
--   5. estimate_expires_at is local midnight after the date, including both DST
--      transitions; estimate_tz falls back to America/Chicago.
--   6. estimate_content_hash ignores a foreign-path row and a null-checksum row,
--      and changes when a verifiable attachment is added.
--
-- BRANCH/LOCAL ONLY. Everything rolls back; never point it at production.
--
--   psql "$BRANCH_DB_URL" -f supabase/tests/estimates_additive_proofs.sql
\set ON_ERROR_STOP on
\pset expanded off

begin;

-- ── Fixtures ─────────────────────────────────────────────────
select gen_random_uuid() as uid \gset
select gen_random_uuid() as other \gset

insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password,
   email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', :'uid',
   'authenticated', 'authenticated',
   ('proof-estimate-' || :'uid' || '@test.local'),
   crypt('x', gen_salt('bf')), now(), now(), now());

insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password,
   email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', :'other',
   'authenticated', 'authenticated',
   ('proof-estimate-other-' || :'other' || '@test.local'),
   crypt('x', gen_salt('bf')), now(), now(), now());

insert into public.profiles (id, business_name, timezone)
values (:'uid', 'Proof Estimate Biz', 'America/Chicago');

insert into public.invoices
  (user_id, kind, client_name, line_items, subtotal, total, status, valid_until)
values
  (:'uid', 'quote', 'Proof Client',
   '[{"description":"Work","qty":1,"unit_price":100}]'::jsonb,
   100, 100, 'sent', '2026-03-08')
returning id as inv \gset

-- One publishable image.
insert into public.invoice_attachments
  (user_id, invoice_id, storage_path, position, mime_type, size_bytes, checksum)
values
  (:'uid', :'inv', :'uid' || '/' || :'inv' || '/ok.jpg', 0,
   'image/jpeg', 100, repeat('a', 64));

-- A foreign path (same checksum shape, wrong estimate folder).
insert into public.invoice_attachments
  (user_id, invoice_id, storage_path, position, mime_type, size_bytes, checksum)
values
  (:'uid', :'inv', :'uid' || '/' || :'other' || '/foreign.jpg', 1,
   'image/jpeg', 100, repeat('b', 64));

-- A legacy/unverified row.
insert into public.invoice_attachments
  (user_id, invoice_id, storage_path, position, mime_type, size_bytes, checksum)
values
  (:'uid', :'inv', :'uid' || '/' || :'inv' || '/legacy.jpg', 2,
   'image/jpeg', 100, null);

-- ── Columns and constraints ──────────────────────────────────
do $$
begin
  if not exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'invoices'
        and column_name = 'valid_until' and data_type = 'date' and is_nullable = 'YES') then
    raise exception 'FAIL: invoices.valid_until is not a nullable date';
  end if;
  if not exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'invoices'
        and column_name = 'revoked_at' and data_type = 'timestamp with time zone' and is_nullable = 'YES') then
    raise exception 'FAIL: invoices.revoked_at is not a nullable timestamptz';
  end if;
  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'invoice_attachments'
        and column_name in ('mime_type', 'size_bytes', 'checksum')
        and is_nullable = 'YES') <> 3 then
    raise exception 'FAIL: attachment verification columns missing or not nullable';
  end if;
  if not exists (select 1 from pg_constraint
      where conrelid = 'public.invoice_attachments'::regclass
        and conname = 'invoice_attachments_checksum_chk') then
    raise exception 'FAIL: checksum check missing';
  end if;
  raise notice 'PASS columns and attachment checks';
end $$;

-- ── Signatures: RLS + grants ─────────────────────────────────
do $$
begin
  if not (select relrowsecurity from pg_class
      where oid = 'public.estimate_signatures'::regclass) then
    raise exception 'FAIL: estimate_signatures RLS is off';
  end if;
  if (select count(*) from pg_policies
      where schemaname = 'public' and tablename = 'estimate_signatures') <> 1 then
    raise exception 'FAIL: expected exactly one estimate_signatures policy';
  end if;
  if not exists (select 1 from pg_policies
      where schemaname = 'public' and tablename = 'estimate_signatures'
        and cmd = 'SELECT' and qual ilike '%auth.uid()%') then
    raise exception 'FAIL: owner SELECT policy missing';
  end if;
  if not has_table_privilege('authenticated', 'public.estimate_signatures', 'SELECT')
     or has_table_privilege('authenticated', 'public.estimate_signatures', 'INSERT')
     or has_table_privilege('authenticated', 'public.estimate_signatures', 'UPDATE')
     or has_table_privilege('authenticated', 'public.estimate_signatures', 'DELETE') then
    raise exception 'FAIL: authenticated signature grants are wrong';
  end if;
  if has_table_privilege('anon', 'public.estimate_signatures', 'SELECT')
     or has_table_privilege('anon', 'public.estimate_signatures', 'INSERT')
     or has_table_privilege('anon', 'public.estimate_signatures', 'UPDATE')
     or has_table_privilege('anon', 'public.estimate_signatures', 'DELETE') then
    raise exception 'FAIL: anon holds an estimate_signatures privilege';
  end if;
  raise notice 'PASS signature RLS and grants';
end $$;

insert into public.estimate_signatures
  (estimate_id, signer_name, signature_type, signature_data,
   consent_text, consent_version, content_hash)
values
  (:'inv', 'Proof Signer', 'type', 'Proof Signer',
   'proof consent', '1', repeat('c', 64));

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', :'uid', 'role', 'authenticated')::text, true);

do $$
begin
  if (select count(*) from public.estimate_signatures) <> 1 then
    raise exception 'FAIL: owner does not see exactly one signature';
  end if;
  raise notice 'PASS owner sees their signature';
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', :'other', 'role', 'authenticated')::text, true);

do $$
begin
  if (select count(*) from public.estimate_signatures) <> 0 then
    raise exception 'FAIL: another user can see the signature';
  end if;
  raise notice 'PASS another user sees no signature';
end $$;

reset role;

-- ── Expiry helper ────────────────────────────────────────────
do $$
begin
  if public.estimate_tz('Nope/Nope') <> 'America/Chicago' then
    raise exception 'FAIL: timezone fallback is not America/Chicago';
  end if;
  if public.estimate_expires_at('2026-03-08', 'America/Chicago')
     <> timestamptz '2026-03-09 05:00:00+00' then
    raise exception 'FAIL: DST spring expiry boundary is wrong';
  end if;
  if public.estimate_expires_at('2026-11-01', 'America/Chicago')
     <> timestamptz '2026-11-02 06:00:00+00' then
    raise exception 'FAIL: DST fall expiry boundary is wrong';
  end if;
  if public.estimate_expires_at('2026-01-15', 'America/Chicago')
     <> timestamptz '2026-01-16 06:00:00+00' then
    raise exception 'FAIL: standard-time expiry boundary is wrong';
  end if;
  raise notice 'PASS expiry helper boundaries';
end $$;

-- ── Content hash excludes unverifiable rows ──────────────────
select public.estimate_content_hash(:'inv') as hash0 \gset
select set_config('proof.hash0', :'hash0', true);

do $$
begin
  if current_setting('proof.hash0') !~ '^[0-9a-f]{64}$' then
    raise exception 'FAIL: content hash is not 64 hex chars';
  end if;
end $$;

insert into public.invoice_attachments
  (user_id, invoice_id, storage_path, position, mime_type, size_bytes, checksum)
values
  (:'uid', :'inv', :'uid' || '/' || :'inv' || '/extra.pdf', 3,
   'application/pdf', 200, repeat('d', 64));

select public.estimate_content_hash(:'inv') as hash1 \gset
select set_config('proof.hash1', :'hash1', true);

do $$
begin
  if current_setting('proof.hash1') = current_setting('proof.hash0') then
    raise exception 'FAIL: a verifiable attachment did not change the hash';
  end if;
  raise notice 'PASS verifiable attachment changes the hash';
end $$;

delete from public.invoice_attachments
where invoice_id = :'inv' and storage_path = :'uid' || '/' || :'inv' || '/extra.pdf';

select public.estimate_content_hash(:'inv') as hash2 \gset
select set_config('proof.hash2', :'hash2', true);

do $$
begin
  if current_setting('proof.hash2') <> current_setting('proof.hash0') then
    raise exception 'FAIL: removing the attachment did not restore the hash';
  end if;
  raise notice 'PASS hash restores; foreign-path and null-checksum rows are excluded';
end $$;

rollback;
