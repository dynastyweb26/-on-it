-- ═══════════════════════════════════════════════════════════════
-- Saved products & services (UI redesign merge 2 · 2·6, UI-REDESIGN-AUDIT §3 B).
--
--   1. public.products — one row per owner per item name (case-insensitive
--      name_key, like clients). A row exists once an item is used on a sent
--      document (history) or saved from the Products screen; saved_at marks
--      the saved list. Delete is soft (deleted_at); a later use brings the
--      item back as unsaved history. unit is one of each / hour / sq ft /
--      job; unit_price is optional; detail is the "Description · shows on
--      invoices" text.
--   2. RLS: owner select / insert / update. No DELETE policy or grant. anon
--      gets nothing; authenticated SELECT, INSERT, UPDATE only.
--   3. record_product_use(p_items jsonb) returns setof text — called
--      fire-and-forget after a document is finalized, with its lines
--      [{name, unit, unit_price}] (<= 50, each validated). Upserts each name:
--      use_count + 1, last_used_at = now(); while the item is unsaved, the
--      last unit / price are kept; a soft-deleted item returns as unsaved
--      history. Returns the unsaved names now used twice or more (save-prompt
--      candidates, Q7: "Not now" never suppresses the next repeat).
--      security invoker; EXECUTE to authenticated only.
--
-- New table only: nothing on main reads or writes it, so it is safe ahead of
-- the merge-2 code. Sorts before 20261005000000_payment_reversals
-- (fix/disputes-refunds, not applied). Idempotent.
-- Verify after applying: npm run db:privcheck — sections D and R.
-- ═══════════════════════════════════════════════════════════════

-- 1 ── products ─────────────────────────────────────────────────────
create table if not exists public.products (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles(id) on delete cascade,
  name                 text not null,
  name_key             text generated always as (lower(btrim(name))) stored,
  unit                 text not null default 'each',
  unit_price           numeric(12,2),
  detail               text,
  use_count            integer not null default 0,
  last_used_at         timestamptz,
  saved_at             timestamptz,
  prompt_dismissed_at  timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  constraint products_user_name_key unique (user_id, name_key),
  constraint products_name_chk check (char_length(btrim(name)) between 1 and 120),
  constraint products_unit_chk check (unit in ('each', 'hour', 'sq ft', 'job')),
  constraint products_price_chk check (unit_price is null or unit_price between 0 and 10000000),
  constraint products_detail_chk check (detail is null or char_length(detail) <= 300),
  constraint products_use_count_chk check (use_count >= 0)
);

drop trigger if exists touch_products on public.products;
create trigger touch_products before update on public.products
  for each row execute function public.touch_updated_at();

-- 2 ── RLS + grants ─────────────────────────────────────────────────
alter table public.products enable row level security;

drop policy if exists "own products select" on public.products;
drop policy if exists "own products insert" on public.products;
drop policy if exists "own products update" on public.products;
create policy "own products select" on public.products
  for select using (auth.uid() = user_id);
create policy "own products insert" on public.products
  for insert with check (auth.uid() = user_id);
create policy "own products update" on public.products
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on table public.products from anon;
revoke delete, truncate, references, trigger on table public.products from authenticated;
grant select, insert, update on table public.products to authenticated;

-- 3 ── record_product_use ───────────────────────────────────────────
create or replace function public.record_product_use(p_items jsonb)
returns setof text
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'items must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'too many items' using errcode = '22023';
  end if;

  return query
  with raw as (
    select ord,
      btrim(coalesce(e->>'name', '')) as name,
      -- null = not given / not valid: the stored value is kept.
      case when e->>'unit' in ('each', 'hour', 'sq ft', 'job') then e->>'unit' end as unit,
      case when jsonb_typeof(e->'unit_price') in ('number', 'string')
            and (e->>'unit_price') ~ '^\s*\d{1,8}(\.\d+)?\s*$'
            and (e->>'unit_price')::numeric <= 10000000
           then round((e->>'unit_price')::numeric, 2) end as unit_price
    from jsonb_array_elements(p_items) with ordinality as t(e, ord)
    where jsonb_typeof(e) = 'object'
  ),
  -- One row per name (the last line wins), so a name used twice on one
  -- document counts once and the upsert never touches a row twice.
  items as (
    select distinct on (lower(name)) name, unit, unit_price
    from raw
    where char_length(name) between 1 and 120
    order by lower(name), ord desc
  ),
  up as (
    insert into public.products as p (user_id, name, unit, unit_price, use_count, last_used_at)
    select uid, i.name, coalesce(i.unit, 'each'), i.unit_price, 1, now() from items i
    on conflict (user_id, name_key) do update set
      use_count    = p.use_count + 1,
      last_used_at = now(),
      -- Unsaved (or coming back from deleted): follow the latest line, but a
      -- line without a valid unit / price keeps the stored one. Saved items
      -- keep what the user set.
      unit         = case when p.saved_at is null or p.deleted_at is not null
                          then coalesce((select i.unit from items i where lower(i.name) = p.name_key), p.unit)
                          else p.unit end,
      unit_price   = case when p.saved_at is null or p.deleted_at is not null
                          then coalesce(excluded.unit_price, p.unit_price) else p.unit_price end,
      saved_at     = case when p.deleted_at is not null then null else p.saved_at end,
      deleted_at   = null
    returning p.name, p.saved_at, p.use_count
  )
  select up.name from up where up.saved_at is null and up.use_count >= 2;
end $$;

revoke execute on function public.record_product_use(jsonb) from public, anon;
grant execute on function public.record_product_use(jsonb) to authenticated;
