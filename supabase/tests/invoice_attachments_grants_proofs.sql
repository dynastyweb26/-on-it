-- Proof script - invoice_attachments grants and policy split.
-- Migration under test: 20261020000001_invoice_attachments_grants.sql
--
-- WHAT IT VERIFIES:
--   1. authenticated has SELECT/INSERT/DELETE on invoice_attachments and no
--      UPDATE (table-level or column-level); anon has nothing.
--   2. service_role keeps SELECT/INSERT/UPDATE/DELETE for server-side work.
--   3. RLS has three owner-only policies (SELECT/INSERT/DELETE), no UPDATE/ALL.
--   4. The private bucket and its three owner storage policies are unchanged.
--   5. As authenticated: insert + select + delete work; UPDATE is 42501.
--   6. As anon: select and insert are 42501.
--   7. As service_role: UPDATE works.
--
-- LOCAL ONLY. It seeds auth.users / profiles / invoices / invoice_attachments
-- and rolls everything back at the end. Never point it at production.
--
-- HOW TO RUN (psql against the local Supabase database):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -f supabase/tests/invoice_attachments_grants_proofs.sql
--
-- Any unexpected result raises an exception, so psql exits non-zero.

\set ON_ERROR_STOP on
\pset expanded off

begin;

-- Test helper: run a statement as the current role and assert its SQLSTATE.
create or replace function public.proof_expect_sqlstate(
  p_sql text,
  p_state text,
  p_label text
) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_state text;
  v_message text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_message = message_text;
    if v_state = p_state then
      raise notice 'PASS % (SQLSTATE %)', p_label, v_state;
      return;
    end if;
    raise exception 'FAIL %: expected SQLSTATE %, got %: %',
      p_label, p_state, v_state, v_message;
  end;

  raise exception 'FAIL %: expected SQLSTATE %, but the statement succeeded',
    p_label, p_state;
end;
$$;

grant execute on function public.proof_expect_sqlstate(text, text, text)
  to anon, authenticated;

-- Fixtures ------------------------------------------------------------------
select gen_random_uuid() as uid \gset

insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password,
   email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', :'uid',
   'authenticated', 'authenticated',
   ('proof-attach-' || :'uid' || '@test.local'),
   crypt('x', gen_salt('bf')), now(), now(), now());

insert into public.profiles (id, business_name)
values (:'uid', 'Proof Attach Biz');

select set_config('proof.uid', :'uid', true);

insert into public.invoices
  (user_id, kind, client_name, line_items, total)
values
  (:'uid', 'invoice', 'Proof Attach Invoice', '[]'::jsonb, 0)
returning id as inv \gset
select set_config('proof.inv', :'inv', true);

-- Static privilege + policy checks ------------------------------------------
do $$
begin
  if has_table_privilege('anon', 'public.invoice_attachments', 'SELECT')
     or has_table_privilege('anon', 'public.invoice_attachments', 'INSERT')
     or has_table_privilege('anon', 'public.invoice_attachments', 'UPDATE')
     or has_table_privilege('anon', 'public.invoice_attachments', 'DELETE')
     or has_table_privilege('anon', 'public.invoice_attachments', 'TRUNCATE') then
    raise exception 'FAIL: anon still holds an invoice_attachments privilege';
  end if;

  if not has_table_privilege('authenticated', 'public.invoice_attachments', 'SELECT')
     or not has_table_privilege('authenticated', 'public.invoice_attachments', 'INSERT')
     or not has_table_privilege('authenticated', 'public.invoice_attachments', 'DELETE') then
    raise exception 'FAIL: authenticated lost a required invoice_attachments privilege';
  end if;

  if has_table_privilege('authenticated', 'public.invoice_attachments', 'UPDATE')
     or has_table_privilege('authenticated', 'public.invoice_attachments', 'TRUNCATE') then
    raise exception 'FAIL: authenticated still has UPDATE/TRUNCATE';
  end if;

  if exists (
    select 1 from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'invoice_attachments'
      and grantee in ('anon', 'authenticated')
      and privilege_type = 'UPDATE'
  ) then
    raise exception 'FAIL: anon/authenticated still have column-level UPDATE';
  end if;

  if not has_table_privilege('service_role', 'public.invoice_attachments', 'SELECT')
     or not has_table_privilege('service_role', 'public.invoice_attachments', 'INSERT')
     or not has_table_privilege('service_role', 'public.invoice_attachments', 'UPDATE')
     or not has_table_privilege('service_role', 'public.invoice_attachments', 'DELETE') then
    raise exception 'FAIL: service_role lost a management privilege';
  end if;

  if (select count(*) from pg_policies
      where schemaname = 'public' and tablename = 'invoice_attachments') <> 3 then
    raise exception 'FAIL: expected exactly three invoice_attachments policies';
  end if;

  if not exists (select 1 from pg_policies
      where schemaname = 'public' and tablename = 'invoice_attachments'
        and policyname = 'own invoice attachments select' and cmd = 'SELECT'
        and qual ilike '%auth.uid() = user_id%')
     or not exists (select 1 from pg_policies
      where schemaname = 'public' and tablename = 'invoice_attachments'
        and policyname = 'own invoice attachments insert' and cmd = 'INSERT'
        and with_check ilike '%auth.uid() = user_id%')
     or not exists (select 1 from pg_policies
      where schemaname = 'public' and tablename = 'invoice_attachments'
        and policyname = 'own invoice attachments delete' and cmd = 'DELETE'
        and qual ilike '%auth.uid() = user_id%') then
    raise exception 'FAIL: expected owner-only SELECT/INSERT/DELETE policies';
  end if;

  if exists (select 1 from pg_policies
      where schemaname = 'public' and tablename = 'invoice_attachments'
        and cmd in ('UPDATE', 'ALL')) then
    raise exception 'FAIL: invoice_attachments still has an UPDATE/ALL policy';
  end if;

  if not exists (select 1 from storage.buckets
      where id = 'invoice-attachments' and not public) then
    raise exception 'FAIL: invoice-attachments bucket is missing or public';
  end if;

  if (select count(*) from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname like 'invoice attachments%') <> 3
     or exists (select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname like 'invoice attachments%' and cmd in ('UPDATE', 'ALL')) then
    raise exception 'FAIL: storage policies changed (expected 3, no UPDATE/ALL)';
  end if;

  raise notice 'PASS static grants, policies and private bucket';
end $$;

-- Authenticated path --------------------------------------------------------
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', :'uid', 'role', 'authenticated')::text,
  true
);
select set_config('request.jwt.claim.sub', :'uid', true);

insert into public.invoice_attachments
  (user_id, invoice_id, storage_path, position)
values
  (:'uid', :'inv', :'uid' || '/' || :'inv' || '/proof-1.jpg', 0);

do $$
begin
  if (select count(*) from public.invoice_attachments
      where invoice_id = current_setting('proof.inv')::uuid) <> 1 then
    raise exception 'FAIL: authenticated insert/select did not work';
  end if;
  raise notice 'PASS authenticated insert + select';
end $$;

select public.proof_expect_sqlstate(
  format(
    'update public.invoice_attachments set position = 1 where invoice_id = %L',
    :'inv'
  ),
  '42501', 'authenticated UPDATE attachment');

delete from public.invoice_attachments where invoice_id = :'inv';

do $$
begin
  if exists (select 1 from public.invoice_attachments
      where invoice_id = current_setting('proof.inv')::uuid) then
    raise exception 'FAIL: authenticated delete did not remove the row';
  end if;
  raise notice 'PASS authenticated delete';
end $$;

-- Leave a row for the anon and service_role checks.
insert into public.invoice_attachments
  (user_id, invoice_id, storage_path, position)
values
  (:'uid', :'inv', :'uid' || '/' || :'inv' || '/proof-2.jpg', 0);

reset role;

-- Anon path ----------------------------------------------------------------
set local role anon;

select public.proof_expect_sqlstate(
  format('select * from public.invoice_attachments where invoice_id = %L', :'inv'),
  '42501', 'anon SELECT attachment');

select public.proof_expect_sqlstate(
  format(
    'insert into public.invoice_attachments '
    '(user_id, invoice_id, storage_path, position) '
    'values (%L, %L, %L, 0)',
    :'uid', :'inv', :'uid' || '/' || :'inv' || '/anon.jpg'
  ),
  '42501', 'anon INSERT attachment');

reset role;

-- service_role path --------------------------------------------------------
set local role service_role;

update public.invoice_attachments
set position = 1
where invoice_id = :'inv';

reset role;

do $$
begin
  if not exists (
    select 1 from public.invoice_attachments
    where invoice_id = current_setting('proof.inv')::uuid
      and position = 1
  ) then
    raise exception 'FAIL: service_role UPDATE attachment did not persist';
  end if;
  raise notice 'PASS service_role UPDATE attachment';
end $$;

\echo 'ALL INVOICE-ATTACHMENT GRANT CHECKS PASSED'

rollback;
