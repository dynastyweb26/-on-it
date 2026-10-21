-- Proof script - invoice server-owned column lock.
-- Migration under test: 20261020000000_pin_invoice_server_columns.sql
--
-- WHAT IT VERIFIES:
--   1. authenticated cannot UPDATE amount_paid, status, paid_at, sent_at,
--      first_sent_at, viewed_at or last_nudge_at (SQLSTATE 42501).
--   2. authenticated cannot INSERT a born-sent row, a nonzero amount_paid,
--      or a paid_at (SQLSTATE 42501).
--   3. authenticated can still UPDATE safe content and INSERT a draft.
--   4. service_role can move the server-owned columns (the send route's role).
--   5. a client payment insert still flips the invoice to paid through the
--      SECURITY DEFINER ledger reconcile.
--   6. the overpayment guard still rejects a manual row above the balance.
--
-- LOCAL ONLY. It seeds auth.users / profiles / invoices and rolls everything
-- back at the end. Never point it at production.
--
-- HOW TO RUN (psql against the local Supabase database):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -f supabase/tests/invoice_server_columns_proofs.sql
--
-- Any unexpected result raises an exception, so psql exits non-zero.

\set ON_ERROR_STOP on
\pset expanded off

begin;

-- Test helper: run a statement as the current role and assert its SQLSTATE.
-- SECURITY INVOKER on purpose: dynamic SQL runs with the caller's grants/RLS.
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
  to authenticated;

-- Fixtures ------------------------------------------------------------------
select gen_random_uuid() as uid \gset

insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password,
   email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', :'uid',
   'authenticated', 'authenticated',
   ('proof-lock-' || :'uid' || '@test.local'),
   crypt('x', gen_salt('bf')), now(), now(), now());

insert into public.profiles (id, business_name)
values (:'uid', 'Proof Lock Biz');

select set_config('proof.uid', :'uid', true);

-- A draft the client is allowed to edit (content only).
insert into public.invoices
  (user_id, kind, client_name, line_items, total)
values
  (:'uid', 'invoice', 'Proof Draft', '[]'::jsonb, 100)
returning id as draft_inv \gset
select set_config('proof.draft_inv', :'draft_inv', true);

-- A sent invoice for the ledger + overpayment checks.
insert into public.invoices
  (user_id, kind, client_name, line_items, total, status)
values
  (:'uid', 'invoice', 'Proof Sent', '[]'::jsonb, 100, 'sent')
returning id as sent_inv \gset
select set_config('proof.sent_inv', :'sent_inv', true);

-- Client role ---------------------------------------------------------------
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', :'uid', 'role', 'authenticated')::text,
  true
);
select set_config('request.jwt.claim.sub', :'uid', true);

-- 1. Server-owned UPDATEs are rejected.
select public.proof_expect_sqlstate(
  format('update public.invoices set amount_paid = 1 where id = %L', :'draft_inv'),
  '42501', 'UPDATE amount_paid');

select public.proof_expect_sqlstate(
  format('update public.invoices set status = ''sent'' where id = %L', :'draft_inv'),
  '42501', 'UPDATE status');

select public.proof_expect_sqlstate(
  format('update public.invoices set paid_at = now() where id = %L', :'draft_inv'),
  '42501', 'UPDATE paid_at');

select public.proof_expect_sqlstate(
  format('update public.invoices set sent_at = now() where id = %L', :'draft_inv'),
  '42501', 'UPDATE sent_at');

select public.proof_expect_sqlstate(
  format('update public.invoices set first_sent_at = now() where id = %L', :'draft_inv'),
  '42501', 'UPDATE first_sent_at');

select public.proof_expect_sqlstate(
  format('update public.invoices set viewed_at = now() where id = %L', :'draft_inv'),
  '42501', 'UPDATE viewed_at');

select public.proof_expect_sqlstate(
  format('update public.invoices set last_nudge_at = now() where id = %L', :'draft_inv'),
  '42501', 'UPDATE last_nudge_at');

-- 2. Server-owned INSERTs are rejected.
select public.proof_expect_sqlstate(
  format(
    'insert into public.invoices '
    '(user_id, kind, client_name, line_items, total, status) '
    'values (%L, ''invoice'', ''Proof insert'', ''[]''::jsonb, 0, ''sent'')',
    :'uid'
  ),
  '42501', 'INSERT status = sent');

select public.proof_expect_sqlstate(
  format(
    'insert into public.invoices '
    '(user_id, kind, client_name, line_items, total, amount_paid) '
    'values (%L, ''invoice'', ''Proof insert'', ''[]''::jsonb, 0, 5)',
    :'uid'
  ),
  '42501', 'INSERT amount_paid');

select public.proof_expect_sqlstate(
  format(
    'insert into public.invoices '
    '(user_id, kind, client_name, line_items, total, paid_at) '
    'values (%L, ''invoice'', ''Proof insert'', ''[]''::jsonb, 0, now())',
    :'uid'
  ),
  '42501', 'INSERT paid_at');

-- 3. Safe client writes still work.
update public.invoices set notes = 'proof-safe' where id = :'draft_inv';

insert into public.invoices
  (user_id, kind, client_name, line_items, total)
values
  (:'uid', 'invoice', 'Proof safe insert', '[]'::jsonb, 0)
returning id as safe_inv \gset
select set_config('proof.safe_inv', :'safe_inv', true);

reset role;

do $$
declare
  v_draft uuid := current_setting('proof.draft_inv')::uuid;
  v_safe  uuid := current_setting('proof.safe_inv')::uuid;
begin
  if not exists (
    select 1 from public.invoices
    where id = v_draft and notes = 'proof-safe'
  ) then
    raise exception 'FAIL: safe notes update did not persist';
  end if;

  if not exists (
    select 1 from public.invoices
    where id = v_safe and status = 'draft' and amount_paid = 0
  ) then
    raise exception 'FAIL: safe draft insert did not persist as a zero-paid draft';
  end if;

  raise notice 'PASS safe client update and draft insert still work';
end $$;

-- 4. service_role (the send route's client) can move server-owned columns.
set local role service_role;

update public.invoices
set amount_paid = 100,
    status      = 'paid',
    paid_at     = now()
where id = :'draft_inv';

reset role;

do $$
declare
  v_draft uuid := current_setting('proof.draft_inv')::uuid;
begin
  if not exists (
    select 1 from public.invoices
    where id = v_draft
      and amount_paid = 100
      and status = 'paid'
      and paid_at is not null
  ) then
    raise exception 'FAIL: service_role could not move server-owned columns';
  end if;

  raise notice 'PASS service_role can move server-owned columns';
end $$;

-- 5. A client ledger insert still reconciles the invoice to paid.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', :'uid', 'role', 'authenticated')::text,
  true
);
select set_config('request.jwt.claim.sub', :'uid', true);

insert into public.invoice_payments (invoice_id, user_id, amount, method)
values (:'sent_inv', :'uid', 100, 'cash');

reset role;

do $$
declare
  v_sent uuid := current_setting('proof.sent_inv')::uuid;
begin
  if not exists (
    select 1 from public.invoices
    where id = v_sent
      and amount_paid = 100
      and status = 'paid'
      and paid_at is not null
  ) then
    raise exception 'FAIL: ledger payment did not reconcile the invoice to paid';
  end if;

  raise notice 'PASS ledger payment still flips the invoice to paid';
end $$;

-- 6. The overpayment guard still rejects a manual row above the balance.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', :'uid', 'role', 'authenticated')::text,
  true
);
select set_config('request.jwt.claim.sub', :'uid', true);

select public.proof_expect_sqlstate(
  format(
    'insert into public.invoice_payments (invoice_id, user_id, amount, method) '
    'values (%L, %L, 0.01, ''cash'')',
    :'sent_inv', :'uid'
  ),
  '23514', 'overpayment guard');

reset role;

do $$
declare
  v_sent uuid := current_setting('proof.sent_inv')::uuid;
begin
  if (select count(*) from public.invoice_payments where invoice_id = v_sent) <> 1 then
    raise exception 'FAIL: overpayment row was not rolled back';
  end if;

  raise notice 'PASS overpayment guard still rejects the extra row';
end $$;

\echo 'ALL INVOICE SERVER-COLUMN CHECKS PASSED'

rollback;
