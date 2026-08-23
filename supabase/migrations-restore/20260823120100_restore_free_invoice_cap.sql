-- ═══════════════════════════════════════════════════════════════
-- RESTORE THE PAYWALL (data-layer half) — free_invoice_limit() back to 2.
--
-- Pair to 20260823120000_paywall_off_raise_free_invoice_cap.sql. Setting the
-- one seam back to 2 re-enables BOTH layers in lockstep: the trigger rejects a
-- free user's 3rd invoice again, and hasAccess() returns false at the cap.
--
-- Kept OUT of supabase/migrations/ on purpose — if it lived there, `db push`
-- would apply the off-migration and this one back-to-back and net to 2, leaving
-- the paywall ON. To restore:
--
--   git mv supabase/migrations-restore/20260823120100_restore_free_invoice_cap.sql \
--          supabase/migrations/
--   npx supabase db push
--
-- Also flip NEXT_PUBLIC_PAYWALL_ENABLED back to unset/true (or remove it) so the
-- UI half — upgrade CTA, trial-reminder cron, canceled-tier gate — re-enables
-- alongside the DB half.
--
-- Matches the original definition in 20260724154509_enforce_free_invoice_cap.sql.
-- Idempotent: create-or-replace.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.free_invoice_limit()
returns int
language sql
immutable
set search_path = public
as $$ select 2 $$;

grant execute on function public.free_invoice_limit() to anon, authenticated;
