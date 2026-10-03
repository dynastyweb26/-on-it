-- ═══════════════════════════════════════════════════════════════
-- Saved clients (UI redesign merge 2 · 2·1, UI-REDESIGN-AUDIT §3 A).
--
--   0. Merge case-only duplicate clients (founder decision 2026-10-03). Per
--      owner, rows whose names match after lower(btrim()) are one client. The
--      keeper is the row with the most linked documents (tie: oldest, then
--      id). The others' invoices/quotes are re-pointed to the keeper, any
--      contact field the keeper lacks is filled from them, then they are
--      deleted. invoices.client_name (the billed snapshot) never changes, so
--      no sent PDF or pay page changes. Preflight 2026-10-03: 7 pairs, all
--      case-only, no conflicting contact fields.
--   1. clients gains saved_at, prompt_dismissed_at, notes (<= 500),
--      updated_at, deleted_at (soft delete) and name_key, a stored generated
--      lower(btrim(name)), unique per owner.
--   2. COMPATIBILITY with the live main code (it ships later): main upserts
--      with ON CONFLICT (user_id, name). That constraint stays, and a BEFORE
--      INSERT trigger snaps a case-variant name onto the stored spelling, so
--      "cyril" conflicts with "Cyril" on (user_id, name) and updates that row
--      instead of failing on the new name_key index.
--   3. Index for linking past documents by name.
--   4. RLS: the FOR ALL "own clients" policy splits into select / insert /
--      update. No DELETE policy or grant (soft delete). anon loses every
--      grant on clients; authenticated keeps SELECT, INSERT, UPDATE only.
--      Nothing in the app deletes a client row; account deletion runs as the
--      service role and cascades from profiles.
--   5. RPCs (security invoker, owner rows by RLS, execute to authenticated
--      only): save_client, client_name_usage, client_summaries.
--
-- Sorts BEFORE 20261005000000_payment_reversals (fix/disputes-refunds, not
-- applied), so that branch can still push in order. client_summaries()
-- reports total_paid = Σ amount_paid; the refunds migration (or a follow-up)
-- replaces it to subtract refunded_amount once that column exists.
-- Verify after applying: npm run db:privcheck — sections D and Q.
-- ═══════════════════════════════════════════════════════════════

-- 0 ── Merge case-only duplicates ──────────────────────────────────
drop table if exists pg_temp.clients_merge;
create temporary table clients_merge as
with ranked as (
  select c.id, c.user_id, lower(btrim(c.name)) as k,
    row_number() over (
      partition by c.user_id, lower(btrim(c.name))
      order by (select count(*) from public.invoices i where i.client_id = c.id) desc,
               c.created_at, c.id) as rn
  from public.clients c
)
select l.id as loser_id, w.id as keeper_id
from ranked l
join ranked w on w.user_id = l.user_id and w.k = l.k and w.rn = 1
where l.rn > 1;

-- Contact fields the keeper lacks: take the first non-null from its
-- duplicates (oldest first).
update public.clients k set
  phone   = coalesce(k.phone,   (select c.phone   from clients_merge m join public.clients c on c.id = m.loser_id
                                 where m.keeper_id = k.id and c.phone   is not null order by c.created_at limit 1)),
  email   = coalesce(k.email,   (select c.email   from clients_merge m join public.clients c on c.id = m.loser_id
                                 where m.keeper_id = k.id and c.email   is not null order by c.created_at limit 1)),
  address = coalesce(k.address, (select c.address from clients_merge m join public.clients c on c.id = m.loser_id
                                 where m.keeper_id = k.id and c.address is not null order by c.created_at limit 1))
where k.id in (select keeper_id from clients_merge);

update public.invoices i set client_id = m.keeper_id
from clients_merge m
where i.client_id = m.loser_id;

delete from public.clients c using clients_merge m where c.id = m.loser_id;

drop table clients_merge;

-- 1 ── Columns ─────────────────────────────────────────────────────
alter table public.clients
  add column if not exists saved_at timestamptz,
  add column if not exists prompt_dismissed_at timestamptz,
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz,
  add column if not exists name_key text generated always as (lower(btrim(name))) stored;

alter table public.clients drop constraint if exists clients_notes_chk;
alter table public.clients add constraint clients_notes_chk
  check (notes is null or char_length(notes) <= 500);

-- One client per owner per name, ignoring case and outer spaces.
create unique index if not exists clients_user_name_key_idx
  on public.clients (user_id, name_key);

-- updated_at follows every write (the shared touch function from 001_init).
drop trigger if exists touch_clients on public.clients;
create trigger touch_clients before update on public.clients
  for each row execute function public.touch_updated_at();

-- 2 ── Case-variant names land on the stored row ────────────────────
create or replace function public.clients_canonical_name()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  stored text;
begin
  select c.name into stored
  from public.clients c
  where c.user_id = NEW.user_id
    and lower(btrim(c.name)) = lower(btrim(NEW.name))
  limit 1;
  if stored is not null then
    NEW.name := stored;
  else
    NEW.name := btrim(NEW.name);
  end if;
  return NEW;
end $$;

drop trigger if exists clients_canonical_name on public.clients;
create trigger clients_canonical_name before insert on public.clients
  for each row execute function public.clients_canonical_name();

-- 3 ── Linking past documents by name ───────────────────────────────
create index if not exists invoices_user_client_key_idx
  on public.invoices (user_id, lower(btrim(client_name)))
  where deleted_at is null;

-- 4 ── RLS + grants ─────────────────────────────────────────────────
drop policy if exists "own clients" on public.clients;
drop policy if exists "own clients select" on public.clients;
drop policy if exists "own clients insert" on public.clients;
drop policy if exists "own clients update" on public.clients;
create policy "own clients select" on public.clients
  for select using (auth.uid() = user_id);
create policy "own clients insert" on public.clients
  for insert with check (auth.uid() = user_id);
create policy "own clients update" on public.clients
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on table public.clients from anon;
revoke delete, truncate, references, trigger on table public.clients from authenticated;
grant select, insert, update on table public.clients to authenticated;

-- 5 ── RPCs ─────────────────────────────────────────────────────────

-- Save (or re-save) a client by name, then link every past document billed to
-- that name. Returns the client id and how many documents were linked.
create or replace function public.save_client(
  p_name text,
  p_phone text default null,
  p_email text default null,
  p_address text default null,
  p_notes text default null
)
returns table (id uuid, linked int)
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  nm text := btrim(coalesce(p_name, ''));
  cid uuid;
  n int;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if char_length(nm) = 0 then
    raise exception 'client name is required' using errcode = '22023';
  end if;

  select c.id into cid from public.clients c
  where c.user_id = uid and c.name_key = lower(nm);

  if cid is null then
    insert into public.clients (user_id, name, phone, email, address, notes, saved_at)
    values (uid, nm, nullif(btrim(p_phone), ''), nullif(btrim(p_email), ''),
            nullif(btrim(p_address), ''), nullif(btrim(p_notes), ''), now())
    returning clients.id into cid;
  else
    -- The stored spelling stays; renaming is the Edit screen's job.
    update public.clients c set
      phone     = coalesce(nullif(btrim(p_phone), ''), c.phone),
      email      = coalesce(nullif(btrim(p_email), ''), c.email),
      address    = coalesce(nullif(btrim(p_address), ''), c.address),
      notes      = coalesce(nullif(btrim(p_notes), ''), c.notes),
      saved_at   = coalesce(c.saved_at, now()),
      deleted_at = null
    where c.id = cid;
  end if;

  update public.invoices i set client_id = cid
  where i.user_id = uid
    and lower(btrim(i.client_name)) = lower(nm)
    and i.deleted_at is null
    and i.client_id is distinct from cid;
  get diagnostics n = row_count;

  return query select cid, n;
end $$;

-- How many invoices / quotes were billed to a name (the New client note).
create or replace function public.client_name_usage(p_name text)
returns table (invoices int, quotes int)
language sql
stable
security invoker
set search_path = public
as $$
  select count(*) filter (where i.kind = 'invoice')::int,
         count(*) filter (where i.kind = 'quote')::int
  from public.invoices i
  where i.user_id = auth.uid()
    and i.deleted_at is null
    and lower(btrim(i.client_name)) = lower(btrim(p_name));
$$;

-- One row per non-deleted client: list status line, "used before · not
-- saved", the 2nd-use prompt and the detail tiles. Balance = total -
-- amount_paid. total_paid ignores refunds until refunded_amount exists.
create or replace function public.client_summaries()
returns table (
  id uuid,
  name text,
  saved boolean,
  doc_count int,
  invoice_count int,
  quote_count int,
  open_count int,
  open_balance numeric,
  overdue_count int,
  overdue_balance numeric,
  quotes_out int,
  total_paid numeric,
  last_used_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select c.id, c.name, c.saved_at is not null,
    count(i.id)::int,
    count(i.id) filter (where i.kind = 'invoice')::int,
    count(i.id) filter (where i.kind = 'quote')::int,
    count(i.id) filter (where i.kind = 'invoice' and i.status in ('sent', 'overdue'))::int,
    coalesce(sum(greatest(i.total - coalesce(i.amount_paid, 0), 0))
      filter (where i.kind = 'invoice' and i.status in ('sent', 'overdue')), 0),
    count(i.id) filter (where i.kind = 'invoice' and i.status = 'overdue')::int,
    coalesce(sum(greatest(i.total - coalesce(i.amount_paid, 0), 0))
      filter (where i.kind = 'invoice' and i.status = 'overdue'), 0),
    count(i.id) filter (where i.kind = 'quote' and i.status = 'sent')::int,
    coalesce(sum(coalesce(i.amount_paid, 0)) filter (where i.kind = 'invoice'), 0),
    max(i.created_at)
  from public.clients c
  left join public.invoices i
    on i.client_id = c.id and i.deleted_at is null
  where c.user_id = auth.uid() and c.deleted_at is null
  group by c.id;
$$;

revoke execute on function public.save_client(text, text, text, text, text) from public, anon;
revoke execute on function public.client_name_usage(text) from public, anon;
revoke execute on function public.client_summaries() from public, anon;
revoke execute on function public.clients_canonical_name() from public, anon, authenticated;
grant execute on function public.save_client(text, text, text, text, text) to authenticated;
grant execute on function public.client_name_usage(text) to authenticated;
grant execute on function public.client_summaries() to authenticated;
