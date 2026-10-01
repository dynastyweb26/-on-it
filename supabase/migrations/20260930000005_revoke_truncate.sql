-- ═══════════════════════════════════════════════════════════════
-- Revoke TRUNCATE from the client roles; drop the empty expenses backup.
--
-- TRUNCATE bypasses RLS entirely. Supabase's default grants gave it to anon
-- and authenticated on nine public tables (privilege check D). PostgREST never
-- issues TRUNCATE, so it wasn't reachable through the app, but no client role
-- should hold it.
--   1. Revoke it on every existing table in public.
--   2. Revoke it from the default privileges, so tables created later (by
--      postgres, which owns every public table and runs migrations) don't
--      bring it back.
--   3. Drop expenses_backup_20260723: a one-off copy from 2026-07-23, 0 rows,
--      RLS on with 0 policies, no dependents, and nothing in src/ or
--      supabase/ references it. No CASCADE, so the drop fails rather than
--      taking anything else with it.
--
-- Idempotent: revokes are no-ops when already revoked; drop ... if exists.
-- Verify after applying: npm run db:privcheck — check D must PASS.
-- ═══════════════════════════════════════════════════════════════

revoke truncate on all tables in schema public from anon, authenticated;

alter default privileges in schema public revoke truncate on tables from anon, authenticated;

drop table if exists public.expenses_backup_20260723;
