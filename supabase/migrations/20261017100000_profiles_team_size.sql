-- ═══════════════════════════════════════════════════════════════
-- Onboarding: team size (intro/onboarding redesign, commit 1).
--
-- One new nullable text column on profiles, answered during onboarding
-- ("How many people work in your business?"). Stored as a stable key, not the
-- display label, so the wording can change in the UI without a migration:
--   'solo'  = just me
--   '2-5'   = 2 to 5 people
--   '6-15'  = 6 to 15 people
--   '16+'   = 16 or more
-- NULL = not answered (existing users, or skipped).
--
-- Client-writable, same as the other onboarding columns: it is part of the
-- onboarding upsert payload (INSERT ... ON CONFLICT (id) DO UPDATE), so
-- authenticated gets INSERT and UPDATE on this one column only. Since
-- 20260925000001 authenticated holds no table-level write on profiles, only
-- per-column grants, so nothing else changes. Privilege check B (INSERT exactly
-- on the onboarding columns) is updated in the same commit.
--
-- Additive only: new nullable column, a CHECK on that new column only,
-- two column-level grants. Idempotent.
-- ═══════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists team_size text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_team_size_chk'
  ) then
    alter table public.profiles
      add constraint profiles_team_size_chk
      check (team_size is null or team_size in ('solo', '2-5', '6-15', '16+'));
  end if;
end $$;

grant insert (team_size) on public.profiles to authenticated;
grant update (team_size) on public.profiles to authenticated;

-- ── Verification — run after applying ─────────────────────────
--
-- A. Column is writable by authenticated for INSERT and UPDATE (expect both true):
-- select has_column_privilege('authenticated', 'public.profiles', 'team_size', 'INSERT') as can_insert,
--        has_column_privilege('authenticated', 'public.profiles', 'team_size', 'UPDATE') as can_update;
--
-- B. Constraint present (expect 1 row):
-- select conname from pg_constraint
-- where conrelid = 'public.profiles'::regclass and conname = 'profiles_team_size_chk';
--
-- C. Then: npm run db:privcheck — B must PASS.
