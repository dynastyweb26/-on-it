-- ═══════════════════════════════════════════════════════════════
-- Estimates data layer, part 1 (additive).
--
-- An estimate is an `invoices` row with kind = 'quote'. There is no separate
-- estimates table. This migration adds only what a public estimate link needs:
--
--   • invoices.valid_until  — a DATE. The estimate is valid through the END of
--                             that day in the business timezone; NULL (every
--                             existing row) means it never expires. Set on the
--                             first send that has none (current local date + 30).
--   • invoices.revoked_at   — the owner closed the link. Terminal.
--   • estimate_signatures   — one row per signed estimate. Service-role writes;
--                             the owner may SELECT for their own quotes; anon
--                             has no access at all.
--   • invoice_attachments   — mime_type, size_bytes and checksum for the
--                             server-verified upload path. The public readers
--                             accept a row only when its checksum is present
--                             AND its path is {owner}/{estimate}/... .
--   • estimate_content_hash — the sha256 the page echoes back and sign_estimate
--                             recomputes inside its transaction.
--   • estimate_expires_at / estimate_tz — the one SQL implementation of the
--                             end-of-local-day rule.
--
-- Deliberately NOT here: any status value ('approved' is approved_at IS NOT
-- NULL; 'converted' is a non-deleted invoice with converted_from = this id),
-- token changes, doc prefixes, last_sent_at, or a caption column.
--
-- No existing row is rewritten: both new columns are nullable with no default,
-- and the attachment columns are nullable for legacy rows.
-- Idempotent: add-column-if-not-exists, create-table-if-not-exists, and
-- drop-then-create for every policy and constraint.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Estimate lifecycle columns ──────────────────────────────
alter table public.invoices
  add column if not exists valid_until date,
  add column if not exists revoked_at  timestamptz;

comment on column public.invoices.valid_until is
  'Last valid business-local day for a quote link. NULL = never expires (legacy).';
comment on column public.invoices.revoked_at is
  'When the owner revoked the public quote link. Terminal; public reads return unavailable.';

-- ── 2. Signatures ──────────────────────────────────────────────
-- One signature per estimate (unique estimate_id) is both the product rule and
-- the idempotency backstop for a double-tapped sign button.
create table if not exists public.estimate_signatures (
  id              uuid primary key default gen_random_uuid(),
  estimate_id     uuid not null references public.invoices(id) on delete cascade,
  signer_name     text not null check (char_length(signer_name) between 1 and 120),
  signature_type  text not null check (signature_type in ('draw', 'type')),
  -- draw: PNG data URL (<= 300000 chars, <= 200 KB decoded); type: the name.
  signature_data  text not null check (char_length(signature_data) between 1 and 300000),
  signed_at       timestamptz not null default now(),
  ip              text check (ip is null or char_length(ip) <= 45),
  user_agent      text check (user_agent is null or char_length(user_agent) <= 512),
  consent_text    text not null check (char_length(consent_text) between 1 and 2000),
  consent_version text not null check (char_length(consent_version) between 1 and 20),
  content_hash    text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  constraint estimate_signatures_one_per_estimate unique (estimate_id),
  constraint estimate_signatures_type_len_chk check (
    (signature_type = 'type' and char_length(signature_data) <= 100)
    or (signature_type = 'draw' and char_length(signature_data) <= 300000)
  )
);

alter table public.estimate_signatures enable row level security;

-- Owner read only. The public page never reads this table directly: it goes
-- through the service-role routes and receives only the summary fields.
drop policy if exists "own estimate signatures select" on public.estimate_signatures;
create policy "own estimate signatures select" on public.estimate_signatures
  for select using (
    exists (
      select 1
      from public.invoices i
      where i.id = estimate_signatures.estimate_id
        and i.user_id = auth.uid()
        and i.kind = 'quote'
    )
  );

revoke all on table public.estimate_signatures from public, anon, authenticated;
grant select on table public.estimate_signatures to authenticated;
grant select, insert, update, delete on table public.estimate_signatures to service_role;

-- ── 3. Attachment verification columns ────────────────────────
-- The existing table stores images for the PDF. Estimates need PDFs too, plus
-- proof that the stored object is what the owner uploaded. Nothing is
-- backfilled: legacy rows stay NULL and are never published (the deliverable
-- filter requires a checksum).
alter table public.invoice_attachments
  add column if not exists mime_type   text,
  add column if not exists size_bytes  bigint,
  add column if not exists checksum    text;

alter table public.invoice_attachments drop constraint if exists invoice_attachments_mime_chk;
alter table public.invoice_attachments add constraint invoice_attachments_mime_chk
  check (mime_type is null or mime_type in ('image/jpeg', 'image/png', 'application/pdf'));

alter table public.invoice_attachments drop constraint if exists invoice_attachments_size_chk;
alter table public.invoice_attachments add constraint invoice_attachments_size_chk
  check (size_bytes is null or (size_bytes > 0 and size_bytes <= 10485760));

alter table public.invoice_attachments drop constraint if exists invoice_attachments_checksum_chk;
alter table public.invoice_attachments add constraint invoice_attachments_checksum_chk
  check (checksum is null or checksum ~ '^[0-9a-f]{64}$');

comment on column public.invoice_attachments.checksum is
  'sha256 (hex) computed by the confirm route from the stored bytes. NULL = legacy/unverified; never published.';

-- ── 4. Timezone + end-of-local-day helpers ────────────────────
-- A null or unrecognised IANA zone falls back to America/Chicago, matching the
-- TS helper in src/lib/estimates/dates.ts.
create or replace function public.estimate_tz(p_tz text)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select n.name from pg_catalog.pg_timezone_names n where n.name = p_tz),
    'America/Chicago'
  );
$$;

-- The first instant the estimate is expired: local midnight after the date.
create or replace function public.estimate_expires_at(p_valid_until date, p_tz text)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select ((p_valid_until + 1)::timestamp) at time zone public.estimate_tz(p_tz);
$$;

-- ── 5. Content hash ───────────────────────────────────────────
-- The single implementation. The public GET returns it; sign_estimate
-- recomputes it under the row lock and rejects a mismatch. Attachments are
-- included only when they are actually publishable (checksum + own path), so a
-- forged row can never change the signed content.
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
        'line_items', i.line_items,
        'subtotal', i.subtotal,
        'tax_rate', i.tax_rate,
        'tax_amount', i.tax_amount,
        'total', i.total,
        'notes', coalesce(i.notes, ''),
        'attachments', coalesce((
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object('id', a.id, 'checksum', a.checksum)
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

-- ── 6. Execute privileges ─────────────────────────────────────
-- Internal helpers only. Public reads and signing go through server routes that
-- use the service role.
revoke execute on function public.estimate_tz(text) from public, anon, authenticated;
revoke execute on function public.estimate_expires_at(date, text) from public, anon, authenticated;
revoke execute on function public.estimate_content_hash(uuid) from public, anon, authenticated;

grant execute on function public.estimate_tz(text) to service_role;
grant execute on function public.estimate_expires_at(date, text) to service_role;
grant execute on function public.estimate_content_hash(uuid) to service_role;

-- Verification after applying:
--   select table_name, column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema = 'public'
--     and (table_name = 'invoices' and column_name in ('valid_until','revoked_at'))
--        or (table_name = 'invoice_attachments' and column_name in ('mime_type','size_bytes','checksum'));
--   -- 5 rows; all nullable.
--
--   select public.estimate_expires_at('2026-03-08', 'America/Chicago');
--   -- 2026-03-09 05:00:00+00 (DST)
--   select public.estimate_expires_at('2026-11-01', 'America/Chicago');
--   -- 2026-11-02 06:00:00+00 (DST)
--
--   select grantee, privilege_type from information_schema.role_table_grants
--   where table_schema = 'public' and table_name = 'estimate_signatures';
--   -- authenticated: SELECT only; anon: none; service_role: all.
--
-- The proof script is supabase/tests/estimates_additive_proofs.sql.
