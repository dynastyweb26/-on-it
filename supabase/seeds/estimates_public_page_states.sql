-- ═══════════════════════════════════════════════════════════════════════════
--  PUBLIC ESTIMATE PAGE — STATE SEED (TEST DATABASE ONLY)
--  Project ref: aiijzulctfpzdfjqyggm  (the estimates branch DB)
--
--  NEVER run any of this against production (bitfmmffnigxjjyxoxfr).
--  No migration: this is a hand-run seed, reviewed before it is pasted into the
--  Supabase SQL Editor. Every statement is scoped to the test client name
--  'ZZ TEST public page…'. Nothing here touches other rows.
--
--  Requires 20261023100200_estimates_title_caption_contact.sql on the DB
--  (title / caption / business_phone / business_email), otherwise the public
--  page's own SELECT fails. Step 0 checks it.
--
--  Companion walkthrough: design/estimates/PUBLIC-PAGE-STATES.md
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 0. Preflight (read-only) ────────────────────────────────────────────────
-- Expect: title, valid_until, revoked_at, approved_at, public_token.
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'invoices'
   and column_name in ('title', 'valid_until', 'revoked_at', 'approved_at', 'public_token')
 order by column_name;

-- Expect one row (the content hash function the page and sign RPC both use).
select n.nspname, p.proname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'estimate_content_hash';

-- Expect one row (the signature table).
select to_regclass('public.estimate_signatures') as signature_table;


-- ── 1. Create the five estimates through chat / voice ───────────────────────
-- Ask On It for five estimates, one at a time, each with this exact client name
-- (the SQL below finds rows by it):
--
--   ZZ TEST public page pending      a normal job, 3-4 lines
--   ZZ TEST public page approved     any job (signed in step 7)
--   ZZ TEST public page expired      any job
--   ZZ TEST public page revoked      any job
--   ZZ TEST public page many items   any job (replaced with 24 lines in step 5)
--
-- A tax rate and a title make the page richer; step 4 sets both anyway.
-- Then confirm they exist as drafts (kind = 'quote', status 'draft'):

select i.invoice_number, i.client_name, i.status, i.kind, i.public_token, i.total
  from public.invoices i
 where i.client_name like 'ZZ TEST public page%'
   and i.kind = 'quote'
   and i.deleted_at is null
 order by i.invoice_number;


-- ── 2. Send them (what POST /api/estimates/[id]/send does) ──────────────────
-- status/sent_at/first_sent_at/valid_until are server-owned for clients; the SQL
-- editor runs as postgres, so this is the same patch the send route writes.
update public.invoices
   set status         = 'sent',
       sent_at        = coalesce(sent_at, now()),
       first_sent_at  = coalesce(first_sent_at, now()),
       valid_until    = current_date + 30
 where client_name like 'ZZ TEST public page%'
   and kind = 'quote'
   and deleted_at is null;


-- ── 3. Expired and revoked ──────────────────────────────────────────────────
-- Expired: the business-local day after valid_until has begun (frame 07).
update public.invoices
   set valid_until = current_date - 2
 where client_name = 'ZZ TEST public page expired'
   and kind = 'quote';

-- Revoked: the unavailable screen (frame 08).
update public.invoices
   set revoked_at = now()
 where client_name = 'ZZ TEST public page revoked'
   and kind = 'quote';


-- ── 4. Pending: title, address, long notes, a real tax rate (frames 01/01b/06) ─
update public.invoices
   set title          = 'Whole-home cabinet refit',
       client_address = '1482 Maple Grove Rd, Naperville IL',
       tax_rate       = 8.25,
       notes          = E'Thanks for having us out. This estimate covers tear-out, disposal and install.\n\nWhat is included:\n• Remove the old uppers and lowers\n• Patch and repaint the wall line\n• Install new boxes, doors and pulls\n• Haul everything away\n\nWhat is not included:\n• Countertop fabrication (quoted separately)\n• Electrical or plumbing relocation\n• Wall repair beyond the cabinet line\n\nValid for 30 days from the date above. A 30% deposit books the install week; the balance is due when the job is done. Reach out any time if you want to walk through the numbers or add a room.',
       tax_amount     = round(coalesce(subtotal, 0) * 0.0825, 2),
       total          = coalesce(subtotal, 0) + round(coalesce(subtotal, 0) * 0.0825, 2)
 where client_name = 'ZZ TEST public page pending'
   and kind = 'quote';


-- ── 5. "Many items": 24 lines with detail text (frame 02) ───────────────────
do $$
declare
  v_id       uuid;
  v_rate     numeric := 8.25;
  v_items    jsonb := '[]'::jsonb;
  v_subtotal numeric := 0;
  v_qty      int;
  v_price    numeric;
  v_units    text[] := array['each', 'hour', 'sq ft', 'job'];
begin
  select id into v_id
    from public.invoices
   where client_name = 'ZZ TEST public page many items'
     and kind = 'quote'
     and deleted_at is null
   order by invoice_number desc
   limit 1;

  if v_id is null then
    raise notice 'No "many items" estimate found — create it in chat first.';
    return;
  end if;

  for i in 1..24 loop
    v_qty   := (i % 4) + 1;
    v_price := 45 + i * 5;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'description', 'Line ' || i || ' — cabinet hardware and fitting',
      'qty',         v_qty,
      'unit',        v_units[(i % 4) + 1],
      'unit_price',  v_price,
      'detail',      'Supplied and fitted, including fixings and cleanup for item ' || i || '.'
    ));
    v_subtotal := v_subtotal + (v_qty * v_price);
  end loop;

  update public.invoices
     set line_items = v_items,
         subtotal   = v_subtotal,
         tax_rate   = v_rate,
         tax_amount = round(v_subtotal * v_rate / 100, 2),
         total      = v_subtotal + round(v_subtotal * v_rate / 100, 2),
         title      = 'Kitchen and two baths — full hardware schedule',
         client_address = '1482 Maple Grove Rd, Naperville IL',
         notes      = 'Twenty-four lines so the page has to collapse and expand. Tap any row to open its description.'
   where id = v_id;
end $$;


-- ── 6. Attachments (frames 11, 12, 13, 14) ──────────────────────────────────
-- 1. In Dashboard → Storage → bucket `invoice-attachments`, open the folder
--    printed by this query and upload 5-6 files there (4 JPG/PNG + 1-2 PDF):
--
--    select user_id || '/' || id || '/' as storage_folder
--      from public.invoices
--     where client_name = 'ZZ TEST public page pending' and kind = 'quote';
--
-- 2. Then insert one row per uploaded object (position 0..9, max 10). The
--    checksum only has to be 64 hex characters to pass the deliverable rule;
--    it does not have to be the file's real sha256 for a visual test.
insert into public.invoice_attachments
  (user_id, invoice_id, storage_path, position, mime_type, size_bytes, checksum, caption)
select i.user_id,
       i.id,
       o.name,
       (row_number() over (order by o.name))::int - 1,
       case
         when o.name ilike '%.pdf' then 'application/pdf'
         when o.name ilike '%.png' then 'image/png'
         else 'image/jpeg'
       end,
       coalesce((o.metadata->>'size')::int, 0),
       repeat('a', 64),
       'Test attachment'
  from public.invoices i
  join storage.objects o
    on o.bucket_id = 'invoice-attachments'
   and o.name like i.user_id || '/' || i.id || '/%'
 where i.client_name = 'ZZ TEST public page pending'
   and i.kind = 'quote'
on conflict (invoice_id, position) do nothing;

-- Frame 14 (failed attachment + inline retry): a row whose object does not
-- exist. Signing must still work. Remove it with the cleanup block at the end.
insert into public.invoice_attachments
  (user_id, invoice_id, storage_path, position, mime_type, size_bytes, checksum, caption)
select i.user_id,
       i.id,
       i.user_id || '/' || i.id || '/missing-object.jpg',
       9,
       'image/jpeg',
       120000,
       repeat('a', 64),
       'Missing object (failed state)'
  from public.invoices i
 where i.client_name = 'ZZ TEST public page pending'
   and i.kind = 'quote'
on conflict (invoice_id, position) do nothing;

-- Confirm what the page will serve:
select a.position, a.mime_type, a.size_bytes, a.caption, a.storage_path
  from public.invoice_attachments a
  join public.invoices i on i.id = a.invoice_id
 where i.client_name like 'ZZ TEST public page%'
 order by i.invoice_number, a.position;


-- ── 7. Approved (frame 06) — two ways, pick ONE ─────────────────────────────
-- (a) Recommended: sign the "approved" estimate on the preview page. That also
--     exercises the whole sign flow and writes the real signature row.
-- (b) Or seed it. The stored hash must be the current one; approved_at alone is
--     what makes the page say approved.
insert into public.estimate_signatures
  (estimate_id, signer_name, signature_type, signature_data,
   consent_text, consent_version, content_hash, ip, user_agent)
select i.id,
       'Jordan Ellis (test)',
       'type',
       'Jordan Ellis (test)',
       'I agree to this estimate and to sign electronically. By approving, you agree to sign this estimate electronically.',
       '1',
       public.estimate_content_hash(i.id),
       null,
       'seed-sql'
  from public.invoices i
 where i.client_name = 'ZZ TEST public page approved'
   and i.kind = 'quote'
on conflict (estimate_id) do nothing;

update public.invoices
   set approved_at = coalesce(approved_at, now())
 where client_name = 'ZZ TEST public page approved'
   and kind = 'quote';


-- ── 8. No logo, no brand color → initials tile + gold fallback (frame 09) ───
-- FIRST run this and KEEP the output; it is the exact restore statement.
select format(
         'update public.profiles set logo_url = %L, brand_colors = %L, background_color = %L where id = %L;',
         logo_url, brand_colors, background_color, id
       ) as restore_statement
  from public.profiles
 where id = (select user_id
               from public.invoices
              where client_name like 'ZZ TEST public page%'
              order by invoice_number desc
              limit 1);

-- Then strip the branding (test seller only). brand_colors is NOT NULL with
-- default '{}' (001_init.sql), so it resets to an empty array — null would
-- fail with a not-null violation. The page treats no colors as the gold
-- fallback, which is frame 09.
update public.profiles
   set logo_url = null,
       brand_colors = '{}',
       background_color = null
 where id = (select user_id
               from public.invoices
              where client_name like 'ZZ TEST public page%'
              order by invoice_number desc
              limit 1);

-- Restore it afterwards by running the statement saved above.


-- ── 9. What the page should show (read-only spot check) ─────────────────────
select i.invoice_number,
       i.client_name,
       i.status,
       i.approved_at,
       i.revoked_at,
       i.valid_until,
       jsonb_array_length(coalesce(i.line_items, '[]'::jsonb)) as items,
       (select count(*) from public.invoice_attachments a where a.invoice_id = i.id) as attachments,
       i.public_token
  from public.invoices i
 where i.client_name like 'ZZ TEST public page%'
   and i.kind = 'quote'
 order by i.invoice_number;


-- ── 10. Cleanup — soft-delete every test row ────────────────────────────────
-- Soft delete matches how the app deletes, and it makes each link show the
-- unavailable screen. The attachment rows are removed so the storage objects can
-- be deleted by hand in the dashboard afterwards.
delete from public.invoice_attachments
 where invoice_id in (
   select id from public.invoices
    where client_name like 'ZZ TEST public page%'
 );

update public.invoices
   set deleted_at = now()
 where client_name like 'ZZ TEST public page%'
   and deleted_at is null;

-- Then, in Dashboard → Storage → invoice-attachments, delete the folders for
-- those estimates, and restore the profile with the statement from step 8.
--
-- Signature rows stay attached to the soft-deleted estimates (they are the
-- record of a signing); they are unreachable from the page once deleted.
