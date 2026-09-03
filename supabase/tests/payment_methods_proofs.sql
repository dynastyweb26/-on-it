-- ═══════════════════════════════════════════════════════════════
-- Proof script — public invoice read path (get_public_invoice).
-- Migration under test: 20260901120000_payment_methods_and_public_invoice.sql
--
-- WHAT IT VERIFIES (six checks):
--   1. Seed fixtures: a test user, a finalized invoice whose first line
--      item carries original_description, and a draft invoice; a Zelle
--      value encrypted via set_zelle.
--   2. get_public_invoice(valid token) returns the finalized invoice —
--      full output, for a manual leak read. Only the 11 whitelisted
--      columns; NO user_id / client_* / finalize_key / notes /
--      subtotal / tax_* / timestamps, and NO original_description
--      anywhere inside the re-projected line_items.
--   3. get_public_invoice(garbage token) → zero rows, not an error.
--   4. get_public_invoice(draft's token) → zero rows ("never existed"
--      and "exists but unfinalized" are indistinguishable).
--   5. anon and authenticated cannot execute it (has_function_privilege
--      false for both); calling it as anon raises permission denied.
--   6. Zelle round-trip: the inlined pgp_sym_decrypt in
--      get_public_invoice matches get_zelle() and the known plaintext.
--
-- LOCAL ONLY. Never run this against production — it seeds rows into
-- auth.users / public.profiles / public.invoices. It is a fixture-based
-- proof for a developer's local Supabase stack.
--
-- HOW TO RUN (psql inside the local Supabase db container):
--   docker exec -i supabase_db_on-it psql -U postgres -d postgres \
--     < supabase/tests/payment_methods_proofs.sql
--   (container name is supabase_db_<project>; here: supabase_db_on-it.
--    Equivalently, with a local psql on PATH:
--    psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
--      -f supabase/tests/payment_methods_proofs.sql)
--
-- THROWAWAY KEY: the :KEY below ('proof_key_9f3a') is a TEST FIXTURE
-- used only to set_zelle and read it back within this script. It is NOT
-- the real ZELLE_ENC_KEY and encrypts nothing of value.
-- ═══════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
\pset expanded on
\set KEY 'proof_key_9f3a'

-- ── SEED ────────────────────────────────────────────────────────
-- One test user (unique uuid + email each run so re-runs never collide).
select gen_random_uuid() as uid \gset

insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password,
   email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', :'uid',
   'authenticated', 'authenticated',
   ('proof-' || :'uid' || '@test.local'),
   crypt('x', gen_salt('bf')), now(), now(), now());

insert into public.profiles (id, business_name)
  values (:'uid', 'Proof Biz');

-- All three display handles set, so the whitelist proves they pass through.
update public.profiles
  set venmo_username = '@proofbiz',
      paypal_me      = 'paypal.me/proofbiz',
      cashapp_tag    = '$proofbiz'
  where id = :'uid';

-- Zelle: encrypt a known plaintext so the round-trip can compare it back.
select public.set_zelle(:'uid', '555-0142', :'KEY');

-- Finalized invoice. FIRST line item carries original_description →
-- re-projection MUST strip it. status='sent' (non-draft).
insert into public.invoices
  (user_id, kind, invoice_number, client_name, line_items, total, status)
values
  (:'uid', 'invoice', 1, 'Jane Client',
   '[{"description":"Labor","qty":2,"unit_price":50,"original_description":"AI-WROTE-THIS-SHOULD-NOT-LEAK"},
     {"description":"Parts","qty":1,"unit_price":25}]'::jsonb,
   125, 'sent')
returning public_token as fin_token \gset

-- Draft invoice (proof 3). Trigger stamps a token even on drafts.
insert into public.invoices
  (user_id, kind, invoice_number, client_name, line_items, total, status)
values
  (:'uid', 'invoice', 2, 'Draft Client',
   '[{"description":"Sketch","qty":1,"unit_price":10}]'::jsonb,
   10, 'draft')
returning public_token as draft_token \gset

\echo '════════ PROOF 1: valid token, finalized invoice — FULL output ════════'
\echo '(inspect: no user_id / client_* / finalize_key / notes / subtotal / tax_* /'
\echo ' timestamps, and NO original_description inside line_items)'
select * from public.get_public_invoice(:'fin_token', :'KEY');

\echo '════════ PROOF 2: garbage token — expect ZERO rows, no error ════════'
select * from public.get_public_invoice('not-a-real-token-zzzz', :'KEY');

\echo '════════ PROOF 3: draft invoice token — expect ZERO rows ════════'
select * from public.get_public_invoice(:'draft_token', :'KEY');

\echo '════════ PROOF 5: Zelle round-trip (inline vs get_zelle vs plaintext) ════════'
\pset expanded off
select
  (select zelle from public.get_public_invoice(:'fin_token', :'KEY')) as inlined,
  public.get_zelle(:'uid', :'KEY')                                    as via_get_zelle,
  '555-0142'                                                          as expected;

\echo '════════ PROOF 4a: has_function_privilege for anon & authenticated ════════'
select
  has_function_privilege('anon',          'public.get_public_invoice(text, text)', 'execute') as anon_can_execute,
  has_function_privilege('authenticated', 'public.get_public_invoice(text, text)', 'execute') as authenticated_can_execute;

\echo '════════ PROOF 4b: attempt the call AS anon — expect permission denied ════════'
\set ON_ERROR_STOP off
set role anon;
select * from public.get_public_invoice(:'fin_token', :'KEY');
reset role;
\set ON_ERROR_STOP on

-- Cleanup is intentionally omitted so you can re-inspect. To remove the test
-- data:  delete from auth.users where id = '<uid printed above>';  (cascades)
