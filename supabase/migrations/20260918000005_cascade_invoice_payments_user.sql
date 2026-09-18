-- ═══════════════════════════════════════════════════════════════
-- invoice_payments.user_id → auth.users: NO ACTION → ON DELETE CASCADE
--
-- invoice_payments was created (20260918000000) with user_id referencing
-- auth.users(id) with no ON DELETE clause — i.e. NO ACTION (confdeltype='a') —
-- while invoice_id cascades. Account deletion (/api/delete-account) deletes the
-- auth.users row, which cascades auth.users → profiles → invoices →
-- invoice_payments (via invoice_id CASCADE) within a single statement; because
-- NO ACTION is an END-OF-STATEMENT check, the payment rows are already gone by
-- the time it runs, so the delete does NOT reliably fail. The dependence on
-- statement timing is fragile and the intent is wrong regardless: a payment
-- belongs to its user and should die with the account, exactly like invoice_id.
--
-- Make it explicit. Idempotent: drop-then-add the named constraint.
-- ═══════════════════════════════════════════════════════════════

alter table public.invoice_payments
  drop constraint if exists invoice_payments_user_id_fkey,
  add constraint invoice_payments_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade;
