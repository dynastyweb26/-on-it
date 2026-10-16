-- ═══════════════════════════════════════════════════════════════
-- invoice_payments.method: allow 'bank' (BANK-TRANSFER-SPEC.md, commit 4).
--
-- The pro records a bank transfer / direct deposit by hand in the existing
-- Record payment flow (full → paid, partial → sent, via the unchanged ledger
-- trigger). On It never detects the deposit itself.
--
-- CHANGING MIGRATION — replaces a constraint on an existing column, so per
-- CLAUDE.md it is pushed ONLY from main after the merge (founder decision
-- 2026-10-15): merge --no-ff → dry run / SQL / yes → db push → privcheck →
-- git push origin main. Until then, picking "Bank transfer" on the preview
-- is rejected by the current check.
--
-- Same shape as 20260927000000: drop every CHECK on invoice_payments whose
-- definition mentions `method`, then add the one named constraint with the
-- full list. Existing rows all satisfy it (the list is a superset).
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════

do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.invoice_payments'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%method%'
  loop
    execute format('alter table public.invoice_payments drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.invoice_payments
  add constraint invoice_payments_method_chk
  check (method in ('zelle', 'cash', 'check', 'card', 'cashapp', 'bank', 'other'));

-- ── Verification — run after applying ─────────────────────────
-- Expect exactly ONE check mentioning method: invoice_payments_method_chk,
-- listing zelle, cash, check, card, cashapp, bank, other.
-- select conname, pg_get_constraintdef(oid)
-- from pg_constraint
-- where conrelid = 'public.invoice_payments'::regclass and contype = 'c'
--   and pg_get_constraintdef(oid) ilike '%method%';
