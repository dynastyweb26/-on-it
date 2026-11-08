-- ═══════════════════════════════════════════════════════════════════════════
-- alive layer · phase 4A · item 13 — estimate versions
--
-- An estimate is a row in public.invoices with kind = 'quote'. This adds the
-- two pieces edit-in-place needs and NOTHING else:
--
--   1. invoices.estimate_version — the counter the badge reads ("v2"). 1 while
--      the estimate is a draft and for the first version that goes out; +1 on
--      each CONTENT save after it has been sent, while it is unsigned and
--      unconverted. Drafts never version.
--   2. estimate_versions — one immutable snapshot per version, so v1 (what the
--      client was sent, and possibly signed) survives every later edit. Rows
--      are written only by the trigger below; a browser can read its own rows
--      and nothing else.
--
-- Deliberately NOT in this file:
--   * any status value — "needs re-sign" stays DERIVED, never stored (RULES).
--   * any estimate_signatures change — signing is untouched.
--   * the signed-estimate lock message, which is its own file
--     (20261108130100_estimate_signed_lock_message.sql).
--   * any version on valid_until: extending an estimate's validity is not a
--     content edit, so it neither bumps the counter nor writes a snapshot.
--   * attachment-driven versioning: attachments live in invoice_attachments, so
--     adding/removing/captioning one does not pass through this trigger. See the
--     note at the bottom.
--
-- WHERE THE SNAPSHOT IS WRITTEN
--   In the database, not a route. The estimate page saves line items with a
--   direct client UPDATE (src/components/estimates/EstimateDetail.tsx,
--   applyLineItems), the body fields will be edited the same way in 4A code, and
--   the heading goes through PATCH /api/estimates/[id]/title on the service
--   role. A trigger is the only place all three meet, and it makes the bump and
--   the snapshot one transaction with the edit — a failed edit can never leave a
--   version behind, and no caller can forget to bump.
--
-- TRIGGER ORDER (alphabetical, before the same statement's other triggers)
--   bump_estimate_version        ← this file, runs first
--   guard_locked_estimate_edits  ← raises for signed/converted
--   lock_line_items / lock_sent_invoice_fields ← pin fields outside the window
--   pin_invoice_server_columns   ← refuses client writes to server columns
--   The bump takes its value from OLD on every path, so a client that PATCHes
--   estimate_version directly is simply overwritten — no new pin rule needed.
--
-- Idempotent: add column if not exists, create table if not exists,
-- create-or-replace function, drop-then-create trigger.
--
-- Rollback (in this order; snapshots are only history, nothing reads them yet):
--   drop trigger if exists bump_estimate_version on public.invoices;
--   drop function if exists public.bump_estimate_version();
--   drop table if exists public.estimate_versions;
--   alter table public.invoices drop constraint if exists invoices_estimate_version_chk;
--   alter table public.invoices drop column if exists estimate_version;
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. The counter ────────────────────────────────────────────
alter table public.invoices
  add column if not exists estimate_version int not null default 1;

alter table public.invoices
  drop constraint if exists invoices_estimate_version_chk;
alter table public.invoices
  add constraint invoices_estimate_version_chk check (estimate_version >= 1);

comment on column public.invoices.estimate_version is
  'Estimate revision counter (kind = quote). 1 = draft or first sent version; +1 per content save after send while unsigned and unconverted. Owned by bump_estimate_version(); a client write is overwritten.';

-- ── 2. The snapshot table ─────────────────────────────────────
create table if not exists public.estimate_versions (
  id uuid primary key default gen_random_uuid(),
  -- The estimate this version belongs to. Cascades with the document.
  estimate_id uuid not null references public.invoices (id) on delete cascade,
  -- Denormalized owner so RLS is a plain column check, not a join.
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The version number this snapshot IS (1, 2, 3 …). Unique per estimate: a
  -- second save at the same number is a bug, not a row to merge.
  version int not null,
  -- What the client read at that version: the fields that make up the document.
  -- Render/brand snapshot and terms are excluded — both are pinned after send
  -- and can never change inside the window, so storing them would duplicate the
  -- same bytes on every version.
  content jsonb not null,
  -- Copied out for a list row / a badge without opening the jsonb.
  total numeric,
  created_at timestamptz not null default now(),
  constraint estimate_versions_version_chk check (version >= 1),
  constraint estimate_versions_unique unique (estimate_id, version)
);

-- "Previous version" reads the newest row below the current number.
create index if not exists estimate_versions_estimate_idx
  on public.estimate_versions (estimate_id, version desc);

alter table public.estimate_versions enable row level security;

-- Read: own rows only. The owner's estimate page shows the previous version
-- read-only; the public page never reads this table (it shows the live row).
drop policy if exists "own estimate versions" on public.estimate_versions;
create policy "own estimate versions" on public.estimate_versions
  for select
  using (auth.uid() = user_id);

-- Writes: the trigger below (SECURITY DEFINER, table owner). No client path.
revoke insert, update, delete on public.estimate_versions from anon, authenticated;

-- ── 3. The bump + snapshot trigger ────────────────────────────
-- SECURITY DEFINER because the writer is usually `authenticated`, which has no
-- INSERT right on estimate_versions. set search_path = '' + fully qualified
-- names, like every other function in this schema.
create or replace function public.bump_estimate_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_converted boolean;
  v_changed   boolean;
begin
  -- Estimates only. The trigger's WHEN already filters; this is belt and braces
  -- for a future caller that drops the WHEN clause.
  if NEW.kind is distinct from 'quote' then
    return NEW;
  end if;

  -- A new estimate starts at v1 whatever the client sent.
  if TG_OP = 'INSERT' then
    NEW.estimate_version := 1;
    return NEW;
  end if;

  -- Never trust the incoming number: every path takes it from the stored row.
  NEW.estimate_version := OLD.estimate_version;

  -- Signed or converted: guard_locked_estimate_edits refuses the content change
  -- in the same statement, so a version here would be rolled back anyway. Return
  -- early and leave the counter alone.
  select exists (
    select 1 from public.invoices c
     where c.converted_from = OLD.id
       and c.deleted_at is null
  ) into v_converted;

  if OLD.approved_at is not null or v_converted then
    return NEW;
  end if;

  -- What counts as a change: exactly the fields the client reads in the
  -- document. terms and the render snapshot are pinned after send, so they are
  -- excluded on purpose; viewed_at / sent_at / last_nudge_at are not content.
  -- valid_until is excluded too: Extend moves the offer's expiry, it does not
  -- edit the document, and bumping here would tell the client "Updated" for a
  -- date change. It is still recorded in the snapshot payload below, as the
  -- value that version carried when it was written.
  v_changed :=
       NEW.line_items     is distinct from OLD.line_items
    or NEW.subtotal       is distinct from OLD.subtotal
    or NEW.tax_rate       is distinct from OLD.tax_rate
    or NEW.tax_amount     is distinct from OLD.tax_amount
    or NEW.total          is distinct from OLD.total
    or NEW.notes          is distinct from OLD.notes
    or NEW.title          is distinct from OLD.title
    or NEW.client_name    is distinct from OLD.client_name
    or NEW.client_address is distinct from OLD.client_address
    or NEW.client_phone   is distinct from OLD.client_phone
    or NEW.client_email   is distinct from OLD.client_email
    or NEW.deposit_type   is distinct from OLD.deposit_type
    or NEW.deposit_value  is distinct from OLD.deposit_value;

  if OLD.status = 'draft' then
    -- The draft → sent transition publishes v1: snapshot exactly what the client
    -- is being sent, and do NOT bump. A draft saved ten times is still v1.
    if NEW.status = 'sent' then
      insert into public.estimate_versions
        (estimate_id, user_id, version, content, total, created_at)
      values
        (NEW.id, NEW.user_id, 1, pg_catalog.jsonb_build_object(
          'title',          NEW.title,
          'client_name',    NEW.client_name,
          'client_address', NEW.client_address,
          'client_phone',   NEW.client_phone,
          'client_email',   NEW.client_email,
          'line_items',     NEW.line_items,
          'subtotal',       NEW.subtotal,
          'tax_rate',       NEW.tax_rate,
          'tax_amount',     NEW.tax_amount,
          'total',          NEW.total,
          'notes',          NEW.notes,
          'deposit_type',   NEW.deposit_type,
          'deposit_value',  NEW.deposit_value,
          'valid_until',    NEW.valid_until
        ), NEW.total, pg_catalog.now())
      on conflict (estimate_id, version) do nothing;
    end if;
    return NEW;
  end if;

  -- Sent (or sent-and-viewed) and unsigned: this save is a new version.
  if not v_changed then
    return NEW;
  end if;

  -- Seed the version the client already holds if it was never snapshotted — a
  -- send that happened before this migration, or an estimate already out in the
  -- world. created_at borrows the first-send stamp, which is when that version
  -- became the thing the client had.
  insert into public.estimate_versions
    (estimate_id, user_id, version, content, total, created_at)
  values
    (OLD.id, OLD.user_id, OLD.estimate_version, pg_catalog.jsonb_build_object(
      'title',          OLD.title,
      'client_name',    OLD.client_name,
      'client_address', OLD.client_address,
      'client_phone',   OLD.client_phone,
      'client_email',   OLD.client_email,
      'line_items',     OLD.line_items,
      'subtotal',       OLD.subtotal,
      'tax_rate',       OLD.tax_rate,
      'tax_amount',     OLD.tax_amount,
      'total',          OLD.total,
      'notes',          OLD.notes,
      'deposit_type',   OLD.deposit_type,
      'deposit_value',  OLD.deposit_value,
      'valid_until',    OLD.valid_until
    ), OLD.total, coalesce(OLD.first_sent_at, OLD.updated_at, pg_catalog.now()))
  on conflict (estimate_id, version) do nothing;

  -- The new version itself. Its created_at is the moment the client's link
  -- starts serving new content — this is what "Updated" compares a view against.
  NEW.estimate_version := OLD.estimate_version + 1;

  insert into public.estimate_versions
    (estimate_id, user_id, version, content, total, created_at)
  values
    (NEW.id, NEW.user_id, NEW.estimate_version, pg_catalog.jsonb_build_object(
      'title',          NEW.title,
      'client_name',    NEW.client_name,
      'client_address', NEW.client_address,
      'client_phone',   NEW.client_phone,
      'client_email',   NEW.client_email,
      'line_items',     NEW.line_items,
      'subtotal',       NEW.subtotal,
      'tax_rate',       NEW.tax_rate,
      'tax_amount',     NEW.tax_amount,
      'total',          NEW.total,
      'notes',          NEW.notes,
      'deposit_type',   NEW.deposit_type,
      'deposit_value',  NEW.deposit_value,
      'valid_until',    NEW.valid_until
    ), NEW.total, pg_catalog.now())
  on conflict (estimate_id, version) do nothing;

  return NEW;
end $$;

drop trigger if exists bump_estimate_version on public.invoices;
create trigger bump_estimate_version
  before insert or update on public.invoices
  for each row
  when (new.kind = 'quote')
  execute function public.bump_estimate_version();

-- The trigger function is not callable from a browser.
revoke execute on function public.bump_estimate_version() from public, anon, authenticated;

-- ── 4. Backfill ───────────────────────────────────────────────
-- Nothing to seed: every existing estimate is version 1, which is the column
-- default. Snapshots appear the next time a sent estimate is edited, or when it
-- is sent (draft → sent writes v1 from then on). No UPDATE runs here, so no
-- existing row's updated_at moves.

-- ── 5. Verification after applying ────────────────────────────
--   select tgname from pg_trigger where tgrelid = 'public.invoices'::regclass
--     and not tgisinternal and tgname = 'bump_estimate_version';
--   -- 1 row.
--
--   select column_name, data_type, column_default from information_schema.columns
--    where table_schema = 'public' and table_name = 'invoices'
--      and column_name = 'estimate_version';
--   -- int, default 1.
--
--   -- A sent, unsigned estimate: save a line item as the owner, then read
--   select id, estimate_version from public.invoices where id = '<id>';
--   select version, total, created_at from public.estimate_versions
--    where estimate_id = '<id>' order by version;
--   -- counter 2; snapshot rows v1 (first_sent_at) and v2 (now).
--
--   -- A draft: ten saves, estimate_version is still 1 and no snapshot rows.
--   -- A signed or converted estimate: the save raises 42501 and no version row
--   -- appears (the whole statement rolls back).
--   -- Extend (valid_until only, service role): estimate_version unchanged and
--   -- no new snapshot row.
--
-- ── 6. Known gap, for the 4A code review ──────────────────────
-- Attachments are a separate table (invoice_attachments), so adding, deleting
-- or re-captioning a file inside the sent-unsigned window does NOT bump the
-- version even though the client sees the change. If the design's "Previous
-- version" must show file changes, the follow-up is a second trigger on
-- invoice_attachments that bumps its parent the same way. Not in item 13's
-- scope (estimates.version + estimate_versions only) and not added here.
-- ═══════════════════════════════════════════════════════════════════════════
