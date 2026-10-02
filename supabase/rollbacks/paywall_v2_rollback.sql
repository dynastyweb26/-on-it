-- ═══════════════════════════════════════════════════════════════
-- Paywall v2 ROLLBACK — turns the free caps off again (limits → 1,000,000).
--
-- Use only if launch goes wrong. NOT in supabase/migrations on purpose: a file
-- there would be applied by the next db push. To apply (CLAUDE.md flow):
--   1. Copy this file to supabase/migrations/<YYYYMMDDHHMMSS>_paywall_rollback.sql
--      with a timestamp newer than every existing migration.
--   2. npx supabase db push --dry-run, show the SQL, get the user's yes.
--   3. npx supabase db push, then npm run db:privcheck.
-- Also set NEXT_PUBLIC_PAYWALL_ENABLED=false (Production) and redeploy so the
-- UI stops showing upgrade prompts.
--
-- Same kill-switch value as 20260823120000, for invoices and expenses.
-- Triggers, paywall_reset_at() and the created_at pinning stay in place; with
-- limits this high nobody is capped.
-- Re-enabling later = a new migration setting the limits back.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.free_invoice_limit()
returns int
language sql
immutable
set search_path = ''
as $$ select 1000000 $$;

grant execute on function public.free_invoice_limit() to anon, authenticated;

-- free_expense_limit() exists once 20261001000002 is pushed; with the limit
-- at 1,000,000 the expense trigger never fires either.
create or replace function public.free_expense_limit()
returns int
language sql
immutable
set search_path = ''
as $$ select 1000000 $$;

grant execute on function public.free_expense_limit() to anon, authenticated;
