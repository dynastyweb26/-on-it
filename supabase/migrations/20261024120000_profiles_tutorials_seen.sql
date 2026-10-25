-- ─────────────────────────────────────────────────────────────────────────────
-- In-app tutorials: which tab walkthroughs this profile has seen.
--
-- profiles.tutorials_seen is a jsonb object keyed by tab:
--   { "chat": true, "invoices": true, "clients": true, "books": true,
--     "settings": true }
-- Missing keys mean "not seen". New profiles start at '{}' and autoplay the
-- first unseen tab they open; the client writes only after Skip or Got it.
--
-- Additive only: one nullable-free column with a default, one CHECK, one
-- column-level UPDATE grant. No policy, table-grant or other column changes.
--
-- Existing rows are backfilled to all five true ONCE, when the column is first
-- added. The backfill is inside the `added` branch, so replaying this file
-- cannot mark a new user as seen. New rows keep the '{}' default.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  added boolean := false;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'tutorials_seen'
  ) then
    -- Equivalent to ADD COLUMN IF NOT EXISTS, while keeping a one-time flag
    -- for the backfill below.
    alter table public.profiles
      add column tutorials_seen jsonb not null default '{}'::jsonb;
    added := true;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_tutorials_seen_object_chk'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_tutorials_seen_object_chk
      check (jsonb_typeof(tutorials_seen) = 'object');
  end if;

  if added then
    -- Everyone already in the table has used the app before. Mark every tab
    -- seen so the tutorials never appear retroactively.
    update public.profiles
      set tutorials_seen = '{"chat":true,"invoices":true,"clients":true,"books":true,"settings":true}'::jsonb;
  end if;
end $$;

comment on column public.profiles.tutorials_seen is
  'Tab walkthroughs this profile has seen (jsonb object; missing key = not seen).';

-- The table-level UPDATE was revoked in 20260925000001. Grant only this column;
-- all of the existing safe-column grants are left exactly as they are.
grant update (tutorials_seen) on public.profiles to authenticated;

-- ── Verification (run after applying) ───────────────────────────────────────
-- A. Column shape (expect jsonb / NO / '{}'::jsonb):
-- select data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'profiles'
--   and column_name = 'tutorials_seen';
--
-- B. Client can UPDATE only tutorials_seen, not any other column:
-- select has_column_privilege('authenticated', 'public.profiles', 'tutorials_seen', 'UPDATE') as can_update,
--        has_column_privilege('authenticated', 'public.profiles', 'tutorials_seen', 'INSERT') as can_insert,
--        has_table_privilege('authenticated', 'public.profiles', 'UPDATE') as table_update;
-- expect: true / false / false
--
-- C. Existing rows backfilled (expect every row all five true):
-- select count(*) filter (where tutorials_seen = '{"chat":true,"invoices":true,"clients":true,"books":true,"settings":true}'::jsonb) as backfilled,
--        count(*) as total
-- from public.profiles;
--
-- D. New rows default to '{}':
-- insert into public.profiles (id, business_name) values (gen_random_uuid(), 'default check')
-- returning tutorials_seen;
-- -- rollback the test row if a throwaway user is not available.
--
-- E. After applying: npm run db:privcheck (existing checks must stay PASS).
-- ─────────────────────────────────────────────────────────────────────────────
