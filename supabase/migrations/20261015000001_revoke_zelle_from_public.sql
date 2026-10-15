-- ═══════════════════════════════════════════════════════════════
-- M1 — Revoke zelle functions from PUBLIC / anon / authenticated
--
-- Root cause: Postgres grants EXECUTE to PUBLIC by default on new
-- functions. 001_init.sql revoked from anon and authenticated but
-- left the PUBLIC grant in place. Any role inheriting PUBLIC (which
-- is every role, including future ones) could call these SECURITY
-- DEFINER functions directly via PostgREST /rest/v1/rpc/*.
--
-- Fix: revoke from PUBLIC (catches every role), then grant only to
-- service_role (the admin client that legitimately calls them).
-- The API routes already use adminClient, so no app change needed;
-- we also drop the stale comment in this migration's note rather
-- than touch the TS file here (handled in the code commit).
--
-- Idempotent: REVOKE and GRANT are both safe to re-run.
-- ═══════════════════════════════════════════════════════════════

-- Step 1: Remove the PUBLIC grant Postgres added at CREATE time.
revoke execute on function public.set_zelle(uuid, text, text) from public;
revoke execute on function public.get_zelle(uuid, text)        from public;

-- Step 2: Belt-and-suspenders — keep anon + authenticated revoked
-- in case a future migration re-grants PUBLIC inadvertently.
revoke execute on function public.set_zelle(uuid, text, text) from anon, authenticated;
revoke execute on function public.get_zelle(uuid, text)        from anon, authenticated;

-- Step 3: Allow only service_role (our admin client).
grant execute on function public.set_zelle(uuid, text, text) to service_role;
grant execute on function public.get_zelle(uuid, text)        to service_role;
