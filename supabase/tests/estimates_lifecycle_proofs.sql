-- Proof script - estimates data layer, part 2.
-- Migration under test: 20261023100100_estimates_lifecycle.sql
--
-- VERIFIES:
--   1. A sent, unsigned quote stays editable; a sent invoice stays locked.
--   2. An approved quote rejects client edits and attachment inserts (42501).
--   3. A converted unsigned quote rejects edits and signing.
--   4. sign_estimate: success, one signature, one notification; a double tap
--      returns already_approved without a second row; approved survives expiry.
--   5. Stale hash → content_changed; expired → expired; revoked → revoked;
--      draft → unavailable; null hash / long typed name → validation; a
--      non-PNG drawing → invalid_signature; a valid PNG drawing succeeds.
--   6. add_estimate_attachment commits once and refuses an approved estimate.
--   7. color_roles_explicit stays pinned on a sent quote, both inside the
--      editable window and after approval.
--   8. A client cannot write mime_type/size_bytes/checksum (42501) while a
--      plain legacy attachment insert still works, and the service-role RPC
--      keeps the verification columns.
--
-- BRANCH/LOCAL ONLY. Everything rolls back; never point it at production.
--
--   psql "$BRANCH_DB_URL" -f supabase/tests/estimates_lifecycle_proofs.sql
\set ON_ERROR_STOP on
\pset expanded off

begin;

-- No psql variables inside dollar-quoted bodies: every assertion is an
-- argument evaluated by SQL, and the helper only raises or reports.
create or replace function public.proof_assert(ok boolean, label text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if ok is not true then
    raise exception 'FAIL: %', label;
  end if;
  raise notice 'PASS %', label;
end $$;

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
end $$;

grant execute on function public.proof_assert(boolean, text) to authenticated;
grant execute on function public.proof_expect_sqlstate(text, text, text)
  to authenticated;

-- ── Fixtures ─────────────────────────────────────────────────
select gen_random_uuid() as uid \gset

insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password,
   email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', :'uid',
   'authenticated', 'authenticated',
   ('proof-lifecycle-' || :'uid' || '@test.local'),
   crypt('x', gen_salt('bf')), now(), now(), now());

insert into public.profiles (id, business_name, timezone)
values (:'uid', 'Proof Lifecycle Biz', 'America/Chicago');

-- q1: the main sign/edit flow. q2: converted. q3: stale hash + draw.
-- q4: expired. q5: revoked. q6: draft. q7: attachment quota.
insert into public.invoices
  (user_id, kind, client_name, line_items, subtotal, tax_rate, tax_amount, total,
   notes, status, valid_until, color_roles_explicit)
values
  (:'uid', 'quote', 'Proof Client',
   '[{"description":"Work","qty":1,"unit_price":100}]'::jsonb,
   100, 0, 0, 100, 'Original notes', 'sent',
   (now() at time zone 'America/Chicago')::date + 5, true)
returning id as q1, public_token as tok1 \gset

insert into public.invoices
  (user_id, kind, client_name, line_items, subtotal, total, notes, status, valid_until)
values
  (:'uid', 'quote', 'Converted Client', '[]'::jsonb, 50, 50, 'q2 notes', 'sent',
   (now() at time zone 'America/Chicago')::date + 5)
returning id as q2, public_token as tok2 \gset

insert into public.invoices
  (user_id, kind, client_name, line_items, subtotal, total, notes, status, valid_until)
values
  (:'uid', 'quote', 'Stale Client', '[]'::jsonb, 75, 75, 'q3 notes', 'sent',
   (now() at time zone 'America/Chicago')::date + 5)
returning id as q3, public_token as tok3 \gset

insert into public.invoices
  (user_id, kind, client_name, line_items, subtotal, total, notes, status, valid_until)
values
  (:'uid', 'quote', 'Expired Client', '[]'::jsonb, 10, 10, 'q4 notes', 'sent',
   (now() at time zone 'America/Chicago')::date - 1)
returning id as q4, public_token as tok4 \gset

insert into public.invoices
  (user_id, kind, client_name, line_items, subtotal, total, notes, status, valid_until, revoked_at)
values
  (:'uid', 'quote', 'Revoked Client', '[]'::jsonb, 10, 10, 'q5 notes', 'sent',
   (now() at time zone 'America/Chicago')::date + 5, now())
returning id as q5, public_token as tok5 \gset

insert into public.invoices
  (user_id, kind, client_name, line_items, subtotal, total, notes, status, valid_until)
values
  (:'uid', 'quote', 'Draft Client', '[]'::jsonb, 10, 10, 'q6 notes', 'draft',
   (now() at time zone 'America/Chicago')::date + 5)
returning id as q6, public_token as tok6 \gset

-- q7: attachment quota, unsigned throughout.
insert into public.invoices
  (user_id, kind, client_name, line_items, subtotal, total, notes, status, valid_until)
values
  (:'uid', 'quote', 'Files Client', '[]'::jsonb, 10, 10, 'q7 notes', 'sent',
   (now() at time zone 'America/Chicago')::date + 5)
returning id as q7, public_token as tok7 \gset

-- A sent invoice for the unchanged-lock proof.
insert into public.invoices
  (user_id, kind, client_name, line_items, subtotal, total, notes, status)
values
  (:'uid', 'invoice', 'Invoice Client', '[]'::jsonb, 20, 20, 'Invoice notes', 'sent')
returning id as inv1 \gset

-- ── 1. A sent, unsigned quote is editable; an invoice is not ─
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"' || :'uid' || '","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', :'uid', true);

update public.invoices
   set notes = 'Edited notes',
       total = 120,
       subtotal = 120,
       line_items = '[{"description":"Edited","qty":1,"unit_price":120}]'::jsonb
 where id = :'q1';

select public.proof_assert(
  (select notes = 'Edited notes' and total = 120 and subtotal = 120
     from public.invoices where id = :'q1'),
  'sent quote content is editable');

update public.invoices set notes = 'Hacked invoice' where id = :'inv1';

select public.proof_assert(
  (select notes = 'Invoice notes' from public.invoices where id = :'inv1'),
  'sent invoice stays locked');

-- The render snapshot outranks the content window: color roles must not move.
update public.invoices set color_roles_explicit = false where id = :'q1';

select public.proof_assert(
  (select color_roles_explicit from public.invoices where id = :'q1') is true,
  'color_roles_explicit stays pinned inside the editable window');

-- ── 1b. Verification columns are server-owned ──────────────
select public.proof_expect_sqlstate(
  format(
    'insert into public.invoice_attachments (user_id, invoice_id, storage_path, position, mime_type, size_bytes, checksum) values (%L, %L, %L, 0, %L, %L, %L)',
    :'uid', :'q7', :'uid' || '/' || :'q7' || '/forged.pdf',
    'application/pdf', 1000, repeat('f', 64)
  ),
  '42501', 'client insert with a checksum');

insert into public.invoice_attachments (user_id, invoice_id, storage_path, position)
values (:'uid', :'q7', :'uid' || '/' || :'q7' || '/plain.jpg', 0);

select public.proof_assert(
  (select checksum is null and mime_type is null and size_bytes is null
     from public.invoice_attachments
    where invoice_id = :'q7'
      and storage_path = :'uid' || '/' || :'q7' || '/plain.jpg'),
  'legacy client insert without verification columns still works');

reset role;

delete from public.invoice_attachments
 where invoice_id = :'q7' and storage_path = :'uid' || '/' || :'q7' || '/plain.jpg';

-- ── 2. Sign q1 (typed) ──────────────────────────────────────
select public.estimate_content_hash(:'q1') as h1 \gset

select public.sign_estimate(
  :'tok1', 'Ada Lovelace', 'type', null,
  'proof consent', '1', :'h1', '203.0.113.1', 'proof-agent'
) as sign1 \gset

select public.proof_assert(
  (:'sign1'::jsonb->>'ok')::boolean, 'typed signature signs');
select public.proof_assert(
  (select count(*) from public.estimate_signatures
    where estimate_id = :'q1') = 1, 'exactly one signature');
select public.proof_assert(
  (select count(*) from public.notification_log
    where dedupe_key = 'estimate_approved:' || :'q1') = 1,
  'exactly one estimate_approved notification');
select public.proof_assert(
  (select approved_at from public.invoices where id = :'q1') is not null,
  'approved_at written');
select public.proof_assert(
  (select signature_data = 'Ada Lovelace' from public.estimate_signatures
    where estimate_id = :'q1'), 'typed signature stores the name');

-- ── 3. Double tap is idempotent ─────────────────────────────
select public.sign_estimate(
  :'tok1', 'Ada Lovelace', 'type', null,
  'proof consent', '1', :'h1', '203.0.113.1', 'proof-agent'
) as sign1b \gset

select public.proof_assert(
  (:'sign1b'::jsonb->>'code') = 'already_approved', 'second sign is already_approved');
select public.proof_assert(
  (:'sign1b'::jsonb->'signature'->>'signer_name') = 'Ada Lovelace',
  'already_approved returns the stored signature');
select public.proof_assert(
  (select count(*) from public.estimate_signatures
    where estimate_id = :'q1') = 1, 'double tap adds no signature');
select public.proof_assert(
  (select count(*) from public.notification_log
    where dedupe_key = 'estimate_approved:' || :'q1') = 1,
  'double tap adds no notification');

-- ── 4. Approved edit and attachment are rejected ────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"' || :'uid' || '","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', :'uid', true);

select public.proof_expect_sqlstate(
  format('update public.invoices set notes = %L where id = %L', 'Hacked', :'q1'),
  '42501', 'approved quote edit');

select public.proof_expect_sqlstate(
  format(
    'insert into public.invoice_attachments (user_id, invoice_id, storage_path, position) values (%L, %L, %L, 0)',
    :'uid', :'q1', :'uid' || '/' || :'q1' || '/x.jpg'
  ),
  '42501', 'approved attachment insert');

update public.invoices set color_roles_explicit = false where id = :'q1';

select public.proof_assert(
  (select color_roles_explicit from public.invoices where id = :'q1') is true,
  'color_roles_explicit stays pinned after approval');

reset role;

-- ── 5. Approved survives expiry ─────────────────────────────
update public.invoices
   set valid_until = (now() at time zone 'America/Chicago')::date - 30
 where id = :'q1';

select public.sign_estimate(
  :'tok1', 'Ada Lovelace', 'type', null,
  'proof consent', '1', :'h1', '203.0.113.1', 'proof-agent'
) as sign1c \gset

select public.proof_assert(
  (:'sign1c'::jsonb->>'code') = 'already_approved',
  'approved estimate stays viewable after expiry');

-- ── 6. Converted unsigned quote is locked and unsignable ────
insert into public.invoices
  (user_id, kind, client_name, line_items, subtotal, total, status, converted_from)
values (:'uid', 'invoice', 'Converted Client', '[]'::jsonb, 50, 50, 'draft', :'q2');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"' || :'uid' || '","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', :'uid', true);
select public.proof_expect_sqlstate(
  format('update public.invoices set notes = %L where id = %L', 'Hacked', :'q2'),
  '42501', 'converted quote edit');
reset role;

select public.sign_estimate(
  :'tok2', 'Ada', 'type', null, 'proof consent', '1',
  repeat('a', 64), null, null
) as sign2 \gset

select public.proof_assert(
  (:'sign2'::jsonb->>'code') = 'unavailable', 'converted quote is unsignable');

-- ── 7. Stale hash, then a valid PNG drawing ─────────────────
select public.estimate_content_hash(:'q3') as h3 \gset

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"' || :'uid' || '","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', :'uid', true);
update public.invoices set notes = 'Changed after view' where id = :'q3';
reset role;

select public.sign_estimate(
  :'tok3', 'Ada Lovelace', 'type', null,
  'proof consent', '1', :'h3', null, null
) as sign3 \gset

select public.proof_assert(
  (:'sign3'::jsonb->>'code') = 'content_changed', 'stale hash is content_changed');
select public.proof_assert(
  not exists (select 1 from public.estimate_signatures where estimate_id = :'q3'),
  'stale sign writes no signature');

select public.estimate_content_hash(:'q3') as h3b \gset
select 'data:image/png;base64,' ||
  encode(decode('89504e470d0a1a0a00000000', 'hex'), 'base64') as png \gset

select public.sign_estimate(
  :'tok3', 'Ada Lovelace', 'draw', :'png',
  'proof consent', '1', :'h3b', null, null
) as sign3b \gset

select public.proof_assert(
  (:'sign3b'::jsonb->>'ok')::boolean, 'valid PNG drawing signs');
select public.proof_assert(
  (select signature_data = :'png' from public.estimate_signatures
    where estimate_id = :'q3'), 'drawing data stored verbatim');

-- ── 8. Expired / revoked / draft ────────────────────────────
select public.sign_estimate(
  :'tok4', 'Ada', 'type', null, 'proof consent', '1', repeat('a', 64), null, null
) as sign4 \gset
select public.sign_estimate(
  :'tok5', 'Ada', 'type', null, 'proof consent', '1', repeat('a', 64), null, null
) as sign5 \gset
select public.sign_estimate(
  :'tok6', 'Ada', 'type', null, 'proof consent', '1', repeat('a', 64), null, null
) as sign6 \gset

select public.proof_assert(
  (:'sign4'::jsonb->>'code') = 'expired', 'expired quote is expired');
select public.proof_assert(
  (:'sign5'::jsonb->>'code') = 'revoked', 'revoked quote is revoked');
select public.proof_assert(
  (:'sign6'::jsonb->>'code') = 'unavailable', 'draft quote is unavailable');

-- ── 9. Input validation ─────────────────────────────────────
select public.sign_estimate(
  :'tok3', 'Ada', 'type', null, 'proof consent', '1', null, null, null
) as bad_hash \gset
select public.sign_estimate(
  :'tok3', repeat('x', 101), 'type', null, 'proof consent', '1',
  repeat('a', 64), null, null
) as bad_name \gset
select public.sign_estimate(
  :'tok3', 'Ada', 'draw', 'data:image/jpeg;base64,/9j/4AAQ',
  'proof consent', '1', repeat('a', 64), null, null
) as bad_png \gset
select public.sign_estimate(
  :'tok3', 'Ada', 'scribble', 'x', 'proof consent', '1',
  repeat('a', 64), null, null
) as bad_kind \gset

select public.proof_assert(
  (:'bad_hash'::jsonb->>'code') = 'validation', 'null hash is validation');
select public.proof_assert(
  (:'bad_name'::jsonb->>'code') = 'validation', 'typed name over 100 chars is validation');
select public.proof_assert(
  (:'bad_png'::jsonb->>'code') = 'invalid_signature', 'JPEG drawing is invalid_signature');
select public.proof_assert(
  (:'bad_kind'::jsonb->>'code') = 'validation', 'unknown signature kind is validation');

-- ── 10. Attachment commit, then locked after signing ────────
select public.add_estimate_attachment(
  :'q7', :'uid', :'uid' || '/' || :'q7' || '/ok.pdf',
  'application/pdf', 1000, repeat('d', 64)
) as att \gset

select public.proof_assert(
  (:'att'::jsonb->>'ok')::boolean, 'attachment commit succeeds');
select public.proof_assert(
  (select count(*) from public.invoice_attachments where invoice_id = :'q7') = 1,
  'attachment row exists');
select public.proof_assert(
  (select mime_type = 'application/pdf'
          and size_bytes = 1000
          and checksum = repeat('d', 64)
     from public.invoice_attachments
    where invoice_id = :'q7'
      and storage_path = :'uid' || '/' || :'q7' || '/ok.pdf'),
  'service-role attachment keeps its verification columns');

-- The signature covers the attachment list, so hash AFTER the commit.
select public.estimate_content_hash(:'q7') as h7 \gset
select public.sign_estimate(
  :'tok7', 'Ada Lovelace', 'type', null,
  'proof consent', '1', :'h7', null, null
) as sign7 \gset

select public.proof_assert(
  (:'sign7'::jsonb->>'ok')::boolean, 'estimate with an attachment signs');

select public.add_estimate_attachment(
  :'q7', :'uid', :'uid' || '/' || :'q7' || '/late.pdf',
  'application/pdf', 1000, repeat('e', 64)
) as att2 \gset

select public.proof_assert(
  (:'att2'::jsonb->>'code') = 'locked', 'approved estimate refuses new attachments');

rollback;
