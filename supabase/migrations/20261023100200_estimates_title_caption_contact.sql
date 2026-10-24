-- ═══════════════════════════════════════════════════════════════
-- Estimates data layer, part 3 (M3 — additive only).
--
-- The design needs three things the backend did not have:
--
--   1. invoices.title (<= 120). Owner-editable until the estimate is approved
--      or converted; part of the content hash; shown as the estimate heading.
--   2. invoice_attachments.caption (<= 60). Written ONLY by the service-role
--      RPC set_estimate_attachment_caption (same lock as
--      add_estimate_attachment). No client INSERT/UPDATE of a caption; part of
--      the content hash; shown under the photo/document on the public page.
--   3. profiles.business_phone (<= 30) / profiles.business_email (<= 254),
--      nullable, read LIVE by the public payload (never snapshotted, so a
--      changed number reaches the client). User-writable, same pattern as
--      team_size (20261017100000): column-level UPDATE only, no INSERT (the
--      onboarding upsert simply omits them).
--
-- Also rebuilds estimate_content_hash from its latest definition
-- (20261023100000) with 'title' and each attachment's 'caption' included.
--
-- Additive: two new nullable columns with a CHECK on each, two new nullable
-- profiles columns with a CHECK on each, one new function, and create-or-
-- replace of two guard/lock functions that only ADD a column to what they
-- already pin or refuse. No existing row is rewritten and no existing value
-- changes meaning.
--
-- Idempotent: add-column-if-not-exists, drop-then-add constraints,
-- create-or-replace functions/triggers, repeatable grants.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Estimate title ─────────────────────────────────────────
alter table public.invoices
  add column if not exists title text;

alter table public.invoices drop constraint if exists invoices_title_len_chk;
alter table public.invoices add constraint invoices_title_len_chk
  check (title is null or char_length(title) <= 120);

comment on column public.invoices.title is
  'Estimate heading ("Deck rebuild"). Client-writable while the estimate is a draft or sent-unsigned; pinned after that. Part of estimate_content_hash.';

-- ── 2. Attachment caption ─────────────────────────────────────
alter table public.invoice_attachments
  add column if not exists caption text;

alter table public.invoice_attachments drop constraint if exists invoice_attachments_caption_len_chk;
alter table public.invoice_attachments add constraint invoice_attachments_caption_len_chk
  check (caption is null or char_length(caption) <= 60);

comment on column public.invoice_attachments.caption is
  'Estimate attachment caption. Written only by set_estimate_attachment_caption (service role). Part of estimate_content_hash.';

-- ── 3. Business contact, read live ────────────────────────────
alter table public.profiles
  add column if not exists business_phone text,
  add column if not exists business_email text;

alter table public.profiles drop constraint if exists profiles_business_phone_len_chk;
alter table public.profiles add constraint profiles_business_phone_len_chk
  check (business_phone is null or char_length(business_phone) <= 30);

alter table public.profiles drop constraint if exists profiles_business_email_len_chk;
alter table public.profiles add constraint profiles_business_email_len_chk
  check (business_email is null or char_length(business_email) <= 254);

comment on column public.profiles.business_phone is
  'Business phone shown on the public estimate page. Read live, never snapshotted.';
comment on column public.profiles.business_email is
  'Business email shown on the public estimate page. Read live, never snapshotted.';

-- Same profile-column pattern as 20261017100000_profiles_team_size.sql:
-- authenticated holds column-level UPDATE only (no table-level write since
-- 20260925000001). Not part of the onboarding upsert, so no INSERT grant.
grant update (business_phone) on public.profiles to authenticated;
grant update (business_email) on public.profiles to authenticated;

-- ── 4. Content hash rebuilt (title + caption) ─────────────────
-- The single implementation. Still SECURITY DEFINER + search_path = '' and
-- still service-role only. Attachments are included only when publishable
-- (checksum + own path), exactly as before.
create or replace function public.estimate_content_hash(p_invoice_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.jsonb_build_object(
        -- The billed party is part of what the client reads and signs.
        'client_name', coalesce(i.client_name, ''),
        'client_address', coalesce(i.client_address, ''),
        -- The estimate heading.
        'title', coalesce(i.title, ''),
        'line_items', i.line_items,
        'subtotal', i.subtotal,
        'tax_rate', i.tax_rate,
        'tax_amount', i.tax_amount,
        'total', i.total,
        'notes', coalesce(i.notes, ''),
        'attachments', coalesce((
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', a.id,
              'checksum', a.checksum,
              'caption', coalesce(a.caption, '')
            )
            order by a.position, a.id
          )
          from public.invoice_attachments a
          where a.invoice_id = i.id
            and a.checksum is not null
            and pg_catalog.starts_with(
              a.storage_path,
              i.user_id::text || '/' || i.id::text || '/'
            )
        ), '[]'::jsonb)
      )::text,
      'sha256'
    ),
    'hex'
  )
  from public.invoices i
  where i.id = p_invoice_id;
$$;

revoke execute on function public.estimate_content_hash(uuid) from public, anon, authenticated;
grant execute on function public.estimate_content_hash(uuid) to service_role;

-- ── 5. Title obeys the same editable window ───────────────────
-- Drafts and sent-unsigned quotes keep it editable; approved or converted
-- estimates refuse the change outright (42501), like the other content
-- columns. Zero impact on invoices' existing pins.
create or replace function public.guard_locked_estimate_edits()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return NEW;
  end if;
  if OLD.kind <> 'quote' then
    return NEW;
  end if;
  if OLD.approved_at is null
     and not exists (
       select 1 from public.invoices i
        where i.converted_from = OLD.id
          and i.deleted_at is null
     )
  then
    return NEW;
  end if;

  if NEW.line_items is distinct from OLD.line_items
     or NEW.subtotal is distinct from OLD.subtotal
     or NEW.tax_rate is distinct from OLD.tax_rate
     or NEW.tax_amount is distinct from OLD.tax_amount
     or NEW.total is distinct from OLD.total
     or NEW.notes is distinct from OLD.notes
     or NEW.client_name is distinct from OLD.client_name
     or NEW.client_address is distinct from OLD.client_address
     or NEW.client_phone is distinct from OLD.client_phone
     or NEW.title is distinct from OLD.title
  then
    raise exception 'A signed or converted estimate cannot be changed'
      using errcode = 'insufficient_privilege',
            hint = 'Create a new estimate instead of editing this one.';
  end if;
  return NEW;
end $$;

revoke execute on function public.guard_locked_estimate_edits()
  from public, anon, authenticated;

-- ── 6. Caption is server-owned; attachments keep the same lock ─
-- Client roles can neither set a caption (any INSERT/UPDATE) nor change what
-- they could before. A caption write on an approved/converted estimate is
-- refused here too, so a direct REST call cannot bypass the RPC.
create or replace function public.guard_locked_estimate_attachments()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if current_user not in ('anon', 'authenticated') then
    if tg_op = 'DELETE' then
      return OLD;
    end if;
    return NEW;
  end if;

  -- The verification columns and the caption are written only by the
  -- service-role paths (add_estimate_attachment / set_estimate_attachment_caption).
  -- A client that sets them would publish content nobody verified.
  if tg_op in ('INSERT', 'UPDATE')
     and (NEW.mime_type is not null
          or NEW.size_bytes is not null
          or NEW.checksum is not null
          or NEW.caption is not null) then
    raise exception 'Attachment verification fields and caption are server-owned'
      using errcode = 'insufficient_privilege';
  end if;

  v_id := case when tg_op = 'DELETE' then OLD.invoice_id else NEW.invoice_id end;

  if exists (
    select 1
    from public.invoices i
    where i.id = v_id
      and i.kind = 'quote'
      and (
        i.approved_at is not null
        or exists (
          select 1 from public.invoices c
          where c.converted_from = i.id and c.deleted_at is null
        )
      )
  ) then
    raise exception 'A signed or converted estimate cannot change attachments'
      using errcode = 'insufficient_privilege';
  end if;

  if tg_op = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end $$;

revoke execute on function public.guard_locked_estimate_attachments()
  from public, anon, authenticated;

-- ── 7. A sent/invoice document's title is a snapshot ──────────
-- The render snapshot already freezes the business block; the title is
-- content, so it is pinned for everything except the sent-unsigned quote
-- window (that branch returns early above). Without this, a client could
-- rename a sent invoice.
create or replace function public.lock_sent_invoice_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- First-sent stamp is immutable once set
  NEW.first_sent_at        := OLD.first_sent_at;
  -- Render snapshot — frozen record of what was actually sent. The COLOR-FOR-
  -- ROLES flag (20261020120000) belongs here: without it a re-render could
  -- rescore an old invoice's colors.
  NEW.template             := OLD.template;
  NEW.brand_colors         := OLD.brand_colors;
  NEW.background_color     := OLD.background_color;
  NEW.color_roles_explicit := OLD.color_roles_explicit;
  NEW.business_name        := OLD.business_name;
  NEW.logo_url             := OLD.logo_url;
  NEW.website_url          := OLD.website_url;
  NEW.slogan               := OLD.slogan;
  NEW.cashapp_tag          := OLD.cashapp_tag;
  NEW.paypal_me            := OLD.paypal_me;
  NEW.venmo_username       := OLD.venmo_username;

  -- A sent, unsigned, unconverted quote keeps editable CONTENT. Everything
  -- else — invoices, approved/converted quotes, drafts, paid/overdue/void —
  -- falls through to today's pins.
  if OLD.kind = 'quote'
     and OLD.status = 'sent'
     and OLD.approved_at is null
     and not exists (
       select 1 from public.invoices i
        where i.converted_from = OLD.id
          and i.deleted_at is null
     )
  then
    return NEW;
  end if;

  -- Document money
  NEW.subtotal       := OLD.subtotal;
  NEW.tax_rate       := OLD.tax_rate;
  NEW.tax_amount     := OLD.tax_amount;
  NEW.total          := OLD.total;
  -- Billed party (snapshot)
  NEW.client_name    := OLD.client_name;
  NEW.client_address := OLD.client_address;
  NEW.client_phone   := OLD.client_phone;
  -- Heading (content snapshot)
  NEW.title          := OLD.title;
  -- Notes + deposit terms + due date
  NEW.notes          := OLD.notes;
  NEW.deposit_type   := OLD.deposit_type;
  NEW.deposit_value  := OLD.deposit_value;
  NEW.due_date       := OLD.due_date;
  return NEW;
end $$;

drop trigger if exists lock_sent_invoice_fields on public.invoices;
create trigger lock_sent_invoice_fields
  before update on public.invoices
  for each row
  when (old.status <> 'draft')
  execute function public.lock_sent_invoice_fields();

-- ── 8. Caption write RPC (service role only) ──────────────────
-- Same lock as add_estimate_attachment: the estimate row is locked FOR UPDATE,
-- and an approved or converted estimate is refused. btrim('') becomes NULL so
-- clearing a caption and never having one hash identically.
create or replace function public.set_estimate_attachment_caption(
  p_invoice_id uuid,
  p_user_id uuid,
  p_attachment_id uuid,
  p_caption text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv record;
  v_caption text;
  v_attachment_id uuid;
begin
  v_caption := pg_catalog.btrim(coalesce(p_caption, ''));
  if pg_catalog.char_length(v_caption) > 60 then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'validation');
  end if;
  if v_caption = '' then
    v_caption := null;
  end if;

  select * into v_inv
    from public.invoices
   where id = p_invoice_id
     and user_id = p_user_id
     and kind = 'quote'
     and deleted_at is null
   for update;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'unavailable');
  end if;
  if v_inv.approved_at is not null
     or exists (
       select 1 from public.invoices c
        where c.converted_from = v_inv.id and c.deleted_at is null
     )
  then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'locked');
  end if;

  update public.invoice_attachments a
     set caption = v_caption
   where a.id = p_attachment_id
     and a.invoice_id = p_invoice_id
     and a.user_id = p_user_id
  returning a.id into v_attachment_id;

  if v_attachment_id is null then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'id', v_attachment_id,
    'caption', v_caption
  );
end $$;

revoke execute on function public.set_estimate_attachment_caption(
  uuid, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.set_estimate_attachment_caption(
  uuid, uuid, uuid, text
) to service_role;

-- Verification after applying:
--   select column_name, data_type, is_nullable from information_schema.columns
--   where table_schema = 'public' and table_name = 'invoices' and column_name = 'title';
--     -- text, YES
--   select column_name, data_type, is_nullable from information_schema.columns
--   where table_schema = 'public' and table_name = 'invoice_attachments' and column_name = 'caption';
--     -- text, YES
--   select column_name, data_type, is_nullable from information_schema.columns
--   where table_schema = 'public' and table_name = 'profiles'
--     and column_name in ('business_phone', 'business_email');
--     -- 2 rows, text, YES
--
--   select has_column_privilege('authenticated', 'public.profiles', 'business_phone', 'UPDATE') as phone_upd,
--          has_column_privilege('authenticated', 'public.profiles', 'business_email', 'UPDATE') as email_upd;
--     -- true, true
--   select has_table_privilege('authenticated', 'public.invoice_attachments', 'UPDATE') as att_upd;
--     -- false (unchanged; the caption is only writable through the RPC)
--
--   select public.estimate_content_hash(<id>) before/after an update of title.
--
-- The proof script is supabase/tests/estimates_title_caption_proofs.sql.
