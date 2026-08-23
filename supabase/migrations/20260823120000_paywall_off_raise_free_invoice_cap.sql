-- ═══════════════════════════════════════════════════════════════
-- PAYWALL KILL SWITCH (data-layer half) — raise the free invoice cap.
--
-- free_invoice_limit() is the ONE seam both enforcement layers read:
--   • the enforce_free_invoice_limit() BEFORE INSERT trigger (20260724154509)
--   • hasAccess() in src/lib/access.ts (via rpc)
-- Raise this single number and both layers agree automatically: free users are
-- now under the cap, so the trigger stops rejecting AND hasAccess() returns
-- true. No config table, no GUC read on every insert, no split-brain.
--
-- 1_000_000 (a large INT, deliberately NOT null / -1) so every existing
-- comparison — `v_count >= v_limit` in the trigger, `invoiceCount < limit` in
-- hasAccess() — keeps working untouched.
--
-- The client env flag NEXT_PUBLIC_PAYWALL_ENABLED handles the UI half (upgrade
-- CTA, trial-reminder cron, the canceled-tier gate). This migration handles the
-- DB half the env var cannot reach.
--
-- REVERT: apply supabase/migrations-restore/20260823120100_restore_free_invoice_cap.sql
-- (sets it back to 2). Both layers re-enable together, in lockstep.
--
-- Idempotent: create-or-replace. Grants are preserved across replace; re-granted
-- here so the migration is self-contained on a fresh DB.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.free_invoice_limit()
returns int
language sql
immutable
set search_path = public
as $$ select 1000000 $$;

grant execute on function public.free_invoice_limit() to anon, authenticated;
