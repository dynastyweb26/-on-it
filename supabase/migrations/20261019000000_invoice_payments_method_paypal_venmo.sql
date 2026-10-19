-- ═══════════════════════════════════════════════════════════════
-- invoice_payments.method: allow 'paypal' and 'venmo' for the manual
-- Record payment picker (aligned with the Payouts screen).
--
-- Stored values follow the existing convention: 'cashapp' (not cash_app)
-- and 'bank' (not bank_transfer) stay unchanged. Cash and Check remain
-- valid for legacy rows even though the picker no longer offers them.
--
-- CHANGING MIGRATION — replaces a CHECK on an existing column. Same shape
-- as 20260927000000 and 20261016100000: drop every CHECK on
-- invoice_payments whose definition mentions `method`, then add the one
-- named constraint with the full superset. Idempotent.
--
-- Wrapped in a single transaction: the drop and add either both apply or
-- neither does.
-- ═══════════════════════════════════════════════════════════════

begin;

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
  check (method in (
    'zelle', 'cash', 'check', 'card', 'cashapp', 'bank', 'paypal', 'venmo', 'other'
  ));

commit;

-- ── Verification — run after applying ─────────────────────────
-- Expect exactly ONE check mentioning method: invoice_payments_method_chk,
-- listing zelle, cash, check, card, cashapp, bank, paypal, venmo, other.
-- select conname, pg_get_constraintdef(oid)
-- from pg_constraint
-- where conrelid = 'public.invoice_payments'::regclass and contype = 'c'
--   and pg_get_constraintdef(oid) ilike '%method%';
