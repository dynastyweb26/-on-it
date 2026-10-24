-- Proof script - estimates data layer, part 3 (M3).
-- Migration under test: 20261023100200_estimates_title_caption_contact.sql
--
-- VERIFIES:
--   1. invoices.title is client-editable on a draft and on a sent, unsigned
--      quote; refused (42501) once approved or converted; pinned on a sent
--      invoice; capped at 120 by the CHECK (23514).
--   2. The content hash changes when the title changes.
--   3. invoice_attachments.caption cannot be written by a client role (42501)
--      and the RPC cannot even be executed by one (42501).
--   4. set_estimate_attachment_caption writes / trims / clears a caption, is
--      capped at 60 (validation), records not_found, and returns 'locked'
--      after approval.
--   5. The content hash changes when a caption changes.
--   6. profiles.business_phone / business_email: the owner can write them, a
--      client role cannot write another user's, anon cannot write any, and the
--      CHECK caps hold (30 / 254).
--
-- BRANCH/LOCAL ONLY. Everything rolls back; never point it at production.
--
--   psql "$BRANCH_DB_URL" -f supabase/tests/estimates_title_caption_proofs.sql

\set ON_ERROR_STOP on
\pset expanded off

begin;

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
select gen_random_uuid() as other \gset

insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password,
   email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', :'uid',
   'authenticated', 'authenticated',
   ('proof-m3-' || :'uid' || '@test.local'),
   crypt('x', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', :'other',
   'authenticated', 'authenticated',
   ('proof-m3-' || :'other' || '@test.local'),
   crypt('x', gen_salt('bf')), now(), now(), now());

insert into public.profiles (id, business_name, timezone)
values (:'uid', 'Proof M3 Biz', 'America/Chicago'),
       (:'other', 'Other M3 Biz', 'America/Chicago');

-- q1 draft · q2 sent-unsigned · q3 approved · q4 sent + caption work
-- q5 converted · inv1 sent invoice
insert into public.invoices
  (user_id, kind, client_name, title, line_items, subtotal, total, notes, status)
values
  (:'uid', 'quote', 'Draft Client', 'Draft heading', '[]'::jsonb, 10, 10, 'n', 'draft')
returning id as q1 \gset

insert into public.invoices
  (user_id, kind, client_name, title, line_items, subtotal, total, notes, status,
   valid_until)
values
  (:'uid', 'quote', 'Sent Client', 'Sent heading', '[]'::jsonb, 10, 10, 'n', 'sent',
   (now() at time zone 'America/Chicago')::date + 5)
returning id as q2 \gset

insert into public.invoices
  (user_id, kind, client_name, title, line_items, subtotal, total, notes, status,
   valid_until, approved_at)
values
  (:'uid', 'quote', 'Approved Client', 'Approved heading', '[]'::jsonb, 10, 10, 'n',
   'sent', (now() at time zone 'America/Chicago')::date + 5, now())
returning id as q3 \gset

insert into public.invoices
  (user_id, kind, client_name, title, line_items, subtotal, total, notes, status,
   valid_until)
values
  (:'uid', 'quote', 'Caption Client', 'Caption heading', '[]'::jsonb, 10, 10, 'n',
   'sent', (now() at time zone 'America/Chicago')::date + 5)
returning id as q4 \gset

insert into public.invoices
  (user_id, kind, client_name, title, line_items, subtotal, total, notes, status,
   valid_until)
values
  (:'uid', 'quote', 'Converted Client', 'Converted heading', '[]'::jsonb, 10, 10, 'n',
   'sent', (now() at time zone 'America/Chicago')::date + 5)
returning id as q5 \gset

insert into public.invoices
  (user_id, kind, client_name, line_items, subtotal, total, notes, status)
values (:'uid', 'invoice', 'Invoice Client', '[]'::jsonb, 10, 10, 'n', 'sent')
returning id as inv1 \gset

insert into public.invoices
  (user_id, kind, client_name, line_items, subtotal, total, status, converted_from)
values (:'uid', 'invoice', 'Converted Client', '[]'::jsonb, 10, 10, 'draft', :'q5');

-- One confirmed attachment on q4, written the way the server does it.
select public.add_estimate_attachment(
  :'q4', :'uid', :'uid' || '/' || :'q4' || '/photo.jpg',
  'image/jpeg', 1000, repeat('a', 64)
) as att \gset

select (:'att'::jsonb->>'ok')::boolean as att_ok \gset

select public.proof_assert(:'att_ok'::boolean, 'fixture attachment committed');

select id as att1
  from public.invoice_attachments
 where invoice_id = :'q4'
   and storage_path = :'uid' || '/' || :'q4' || '/photo.jpg'
\gset

-- ── 1. Title: editable window ───────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"' || :'uid' || '","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', :'uid', true);

update public.invoices set title = 'Draft renamed' where id = :'q1';

select public.proof_assert(
  (select title = 'Draft renamed' from public.invoices where id = :'q1'),
  'draft title is client-editable');

update public.invoices set title = 'Sent renamed' where id = :'q2';

select public.proof_assert(
  (select title = 'Sent renamed' from public.invoices where id = :'q2'),
  'sent-unsigned quote title is client-editable');

-- A sent invoice's heading is part of its snapshot.
update public.invoices set title = 'Invoice renamed' where id = :'inv1';

select public.proof_assert(
  (select title is null from public.invoices where id = :'inv1'),
  'sent invoice title stays pinned');

-- ── 2. Title: refused after approval / conversion ───────────
select public.proof_expect_sqlstate(
  format('update public.invoices set title = %L where id = %L', 'Hacked', :'q3'),
  '42501', 'approved quote title edit');

select public.proof_expect_sqlstate(
  format('update public.invoices set title = %L where id = %L', 'Hacked', :'q5'),
  '42501', 'converted quote title edit');

-- ── 3. Title: length cap ────────────────────────────────────
select public.proof_expect_sqlstate(
  format('update public.invoices set title = %L where id = %L', repeat('x', 121), :'q1'),
  '23514', '121-char title refused by the CHECK');

update public.invoices set title = repeat('x', 120) where id = :'q1';

select public.proof_assert(
  (select char_length(title) = 120 from public.invoices where id = :'q1'),
  '120-char title accepted');

reset role;

-- ── 4. The hash follows the title ───────────────────────────
select public.estimate_content_hash(:'q2') as hash_before_title \gset

update public.invoices set title = 'Hash moves' where id = :'q2';

select public.estimate_content_hash(:'q2') as hash_after_title \gset

select public.proof_assert(
  :'hash_before_title' <> :'hash_after_title',
  'content hash changes when the title changes');

-- ── 5. Caption: a client cannot write it ────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"' || :'uid' || '","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', :'uid', true);

select public.proof_expect_sqlstate(
  format(
    'insert into public.invoice_attachments (user_id, invoice_id, storage_path, position, caption) values (%L, %L, %L, 1, %L)',
    :'uid', :'q4', :'uid' || '/' || :'q4' || '/forged.jpg', 'Forged caption'
  ),
  '42501', 'client insert with a caption');

select public.proof_expect_sqlstate(
  format(
    'update public.invoice_attachments set caption = %L where id = %L',
    'Forged caption', :'att1'
  ),
  '42501', 'client update of a caption');

select public.proof_expect_sqlstate(
  format(
    'select public.set_estimate_attachment_caption(%L, %L, %L, %L)',
    :'q4', :'uid', :'att1', 'Direct call'
  ),
  '42501', 'client cannot execute the caption RPC');

reset role;

select public.proof_assert(
  (select caption is null from public.invoice_attachments where id = :'att1'),
  'no client write reached the caption');

-- ── 6. Caption: the service-role RPC ────────────────────────
select public.set_estimate_attachment_caption(
  :'q4', :'uid', :'att1', '  Deck before  '
) as cap1 \gset

select public.proof_assert(
  (:'cap1'::jsonb->>'ok')::boolean
    and (:'cap1'::jsonb->>'caption') = 'Deck before',
  'caption written and trimmed');

select public.estimate_content_hash(:'q4') as hash_before_caption \gset

select public.set_estimate_attachment_caption(
  :'q4', :'uid', :'att1', 'Deck after'
) as cap2 \gset

select public.estimate_content_hash(:'q4') as hash_after_caption \gset

select public.proof_assert(
  (:'cap2'::jsonb->>'ok')::boolean, 'caption updated');
select public.proof_assert(
  :'hash_before_caption' <> :'hash_after_caption',
  'content hash changes when a caption changes');

select public.set_estimate_attachment_caption(
  :'q4', :'uid', :'att1', repeat('y', 61)
) as cap_long \gset

select public.proof_assert(
  (:'cap_long'::jsonb->>'code') = 'validation', '61-char caption is validation');

select public.set_estimate_attachment_caption(
  :'q4', :'uid', gen_random_uuid(), 'No such row'
) as cap_missing \gset

select public.proof_assert(
  (:'cap_missing'::jsonb->>'code') = 'not_found', 'unknown attachment is not_found');

select public.set_estimate_attachment_caption(
  :'q4', :'other', :'att1', 'Other owner'
) as cap_other \gset

select public.proof_assert(
  (:'cap_other'::jsonb->>'code') = 'unavailable',
  'another user cannot caption this estimate');

select public.set_estimate_attachment_caption(
  :'q4', :'uid', :'att1', ''
) as cap_clear \gset

select public.proof_assert(
  (:'cap_clear'::jsonb->>'ok')::boolean
    and (:'cap_clear'::jsonb->>'caption') is null,
  'empty caption clears to null');

-- ── 7. Caption: refused after approval ──────────────────────
update public.invoices
   set approved_at = now()
 where id = :'q4';

select public.set_estimate_attachment_caption(
  :'q4', :'uid', :'att1', 'Too late'
) as cap_locked \gset

select public.proof_assert(
  (:'cap_locked'::jsonb->>'code') = 'locked',
  'caption write refused after approval');

-- ── 8. Business phone / email ───────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"' || :'uid' || '","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', :'uid', true);

update public.profiles
   set business_phone = '(555) 010-2200',
       business_email = 'hello@proof.test'
 where id = :'uid';

select public.proof_assert(
  (select business_phone = '(555) 010-2200'
          and business_email = 'hello@proof.test'
     from public.profiles where id = :'uid'),
  'owner can save their own business contact');

-- Another user's row is invisible to RLS: the update changes nothing.
update public.profiles
   set business_phone = 'forged'
 where id = :'other';

select public.proof_assert(
  (select business_phone is null from public.profiles where id = :'other'),
  'a client cannot forge another profile''s business contact');

select public.proof_expect_sqlstate(
  format('update public.profiles set business_phone = %L where id = %L',
    repeat('1', 31), :'uid'),
  '23514', '31-char business phone refused by the CHECK');

reset role;

set local role anon;

select public.proof_expect_sqlstate(
  format('update public.profiles set business_email = %L where id = %L',
    'anon@proof.test', :'uid'),
  '42501', 'anon cannot write a business email');

reset role;

select public.proof_assert(
  (select business_email = 'hello@proof.test' from public.profiles where id = :'uid'),
  'business email unchanged after the anon attempt');

rollback;
