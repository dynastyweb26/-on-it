-- ═══════════════════════════════════════════════════════════════
-- First-sign-in camera tip (Item 4).
--
-- profiles.camera_tutorial_seen_at marks the one-time camera coach mark as
-- shown. NULL for new profiles (eligible for the auto-start); a timestamp
-- means it has been shown and must not auto-start again.
--
-- Existing profiles are stamped at migration time so the tip never appears
-- retroactively for the current user base. New profiles start NULL.
--
-- Written only by the signed-in client, only when the tip is actually shown.
-- Column-level UPDATE for authenticated; no INSERT grant (new rows default to
-- NULL). Additive + idempotent: the backfill runs only when the column is
-- first added, so re-running cannot mark a new user as seen.
-- ═══════════════════════════════════════════════════════════════

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'camera_tutorial_seen_at'
  ) then
    alter table public.profiles
      add column camera_tutorial_seen_at timestamptz;

    -- Everyone already in the table has signed in before. Mark them seen;
    -- profiles created after this point start NULL and see the tip once.
    update public.profiles
      set camera_tutorial_seen_at = now()
      where camera_tutorial_seen_at is null;
  end if;
end $$;

comment on column public.profiles.camera_tutorial_seen_at is
  'When the one-time first-sign-in camera tip was shown; NULL = not shown.';

grant update (camera_tutorial_seen_at) on public.profiles to authenticated;

-- ── Verification — run after applying ─────────────────────────
--
-- A. Column shape (expect timestamptz / YES / empty default):
-- select data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'profiles'
--   and column_name = 'camera_tutorial_seen_at';
--
-- B. Client can UPDATE it, not INSERT it (expect true, false):
-- select has_column_privilege('authenticated', 'public.profiles', 'camera_tutorial_seen_at', 'UPDATE') as can_update,
--        has_column_privilege('authenticated', 'public.profiles', 'camera_tutorial_seen_at', 'INSERT') as can_insert;
--
-- C. Backfill ran on this first apply (expect still_null = 0 immediately after):
-- select count(*) filter (where camera_tutorial_seen_at is null) as still_null,
--        count(*) as total
-- from public.profiles;
--
-- D. Then: npm run db:privcheck — B safe update and B insert must PASS.
