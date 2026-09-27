-- ═══════════════════════════════════════════════════════════════
-- invoice_payments.method: allow 'cashapp' (Cash App Pay via Stripe Checkout).
--
-- The pay page's Stripe checkout now offers card AND Cash App Pay, and the
-- Connect webhook records the method actually used (read from the
-- PaymentIntent's payment method type). The method CHECK from 20260918000000
-- — method in ('zelle','cash','check','card','other') — would reject a
-- 'cashapp' row (the webhook would 500 and Stripe would retry indefinitely).
--
-- The original CHECK was declared inline (unnamed), so its generated name is
-- not assumed: every CHECK on invoice_payments whose definition mentions
-- `method` is dropped, then one named constraint is added with the full list.
-- Existing rows all satisfy it (the list is a superset).
--
-- 'cashapp' here means Cash App Pay processed BY STRIPE. A manual payment
-- someone sent to the seller's $cashtag outside Stripe is still recorded by
-- the seller as they choose today (no change to Record Payment).
--
-- Idempotent: the drop loop finds nothing to drop on a re-run except the
-- named constraint, which is dropped and re-added identically.
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
  check (method in ('zelle', 'cash', 'check', 'card', 'cashapp', 'other'));

-- ── Verification — run after applying ─────────────────────────
-- Expect exactly ONE check mentioning method: invoice_payments_method_chk,
-- listing zelle, cash, check, card, cashapp, other.
-- select conname, pg_get_constraintdef(oid)
-- from pg_constraint
-- where conrelid = 'public.invoice_payments'::regclass
--   and contype = 'c'
--   and pg_get_constraintdef(oid) ilike '%method%';
