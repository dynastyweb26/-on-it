-- ═══════════════════════════════════════════════════════════════════════════
-- alive layer · document_views
--
-- A view log: one row per qualifying open of a shared document. It exists so
-- the owner-facing event cards can say "2nd time today" and so a view has a
-- time that outlives the single `invoices.viewed_at` timestamp.
--
-- `invoices.viewed_at` and the `mark_invoice_viewed` RPC are untouched (phase-1
-- decision). That RPC is deliberately first-view-only: it stamps the row once
-- and returns nothing afterwards. So a trigger on viewed_at could log at most
-- ONE row per invoice — useless for "2nd time today". This file instead adds a
-- sibling RPC, log_document_view(p_token, p_viewer, p_viewer_hash), which
-- records EVERY qualifying view without stamping the invoice. The existing
-- public route (POST /api/pay/[token]/viewed) calls it next to
-- mark_invoice_viewed; that call is phase-2a code, not this migration.
--
-- No PII: viewer_hash is a salted hash the route computes server-side. The raw
-- address is never passed in and never stored.
--
-- Rollback:
--   drop function if exists public.log_document_view(text, uuid, text);
--   drop table if exists public.document_views;
-- (Nothing else references either object.)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.document_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  document_kind text,
  document_number int,
  -- Salted hash of the request's address + user agent, computed by the server
  -- route. Two views from one device compare equal; the row cannot be turned
  -- back into a person.
  viewer_hash text,
  viewed_at timestamptz not null default now(),
  constraint document_views_kind_chk
    check (document_kind is null or document_kind in ('invoice', 'quote')),
  constraint document_views_hash_len
    check (viewer_hash is null or char_length(viewer_hash) between 16 and 128)
);

-- Today's views for one document (the "2nd time today" count).
create index if not exists document_views_invoice_viewed_idx
  on public.document_views (invoice_id, viewed_at desc);

-- One owner's recent views, for a per-day rollup.
create index if not exists document_views_user_viewed_idx
  on public.document_views (user_id, viewed_at desc);

alter table public.document_views enable row level security;

-- Read: own rows only. Rows are written by the RPC below (SECURITY DEFINER,
-- owned by the table owner), so no client write policy is needed or wanted.
drop policy if exists "own document views" on public.document_views;
create policy "own document views" on public.document_views
  for select
  using (auth.uid() = user_id);

revoke insert, update, delete on public.document_views from anon, authenticated;

-- Record one view of a shared document. The same eligibility rules the view
-- push already uses, minus the "first view only" condition:
--   * the token must resolve to a non-deleted, sent-or-overdue invoice or an
--     estimate that has actually gone out;
--   * views within 2 minutes of sending are the owner checking the link;
--   * the owner's own session is never a client view.
-- It writes nothing to invoices: viewed_at stays the RPC's job.
create or replace function public.log_document_view(
  p_token text,
  p_viewer uuid,
  p_viewer_hash text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.document_views (user_id, invoice_id, document_kind, document_number, viewer_hash)
  select i.user_id, i.id, i.kind, i.invoice_number, p_viewer_hash
    from public.invoices i
   where i.public_token = p_token
     and char_length(p_token) <= 32
     and i.deleted_at is null
     and (
       (i.kind = 'invoice' and i.status in ('sent', 'overdue'))
       or (i.kind = 'quote' and i.status <> 'draft')
     )
     and coalesce(i.sent_at, i.first_sent_at) < now() - interval '2 minutes'
     and (p_viewer is null or p_viewer <> i.user_id);
$$;

revoke execute on function public.log_document_view(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.log_document_view(text, uuid, text)
  to service_role;
