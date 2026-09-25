-- ═══════════════════════════════════════════════════════════════
-- invoice_payments: WITH CHECK must verify the INVOICE belongs to the caller.
--
-- HOLE: "own invoice payments" (20260918000000) is
--   for all using (auth.uid() = user_id) with check (auth.uid() = user_id)
-- It pins the row's user_id to the caller but never checks invoice_id. An
-- authenticated user could insert { user_id: <self>, invoice_id: <someone
-- else's invoice> }. The AFTER trigger sync_invoice_amount_paid is SECURITY
-- DEFINER and calls reconcile_invoice_from_ledger (also SECURITY DEFINER),
-- which updates public.invoices by id with NO ownership check — bypassing
-- the victim's invoice RLS and rewriting their amount_paid / status / paid_at
-- (e.g. flipping a sent invoice to 'paid'). An UPDATE that repoints invoice_id
-- had the same effect.
--
-- FIX: WITH CHECK also requires the referenced invoice to be owned by the
-- caller. WITH CHECK is evaluated on the NEW row for INSERT and UPDATE, so both
-- paths are closed. The subquery runs as the caller, under the invoices RLS
-- ("own invoices select"), and additionally pins i.user_id = auth.uid().
--
-- USING is deliberately unchanged (auth.uid() = user_id): a user can still see
-- and delete any row they own, including any cross-owned row created before
-- this fix, so cleanup is not blocked.
--
-- Service-role writers (future Stripe Connect webhook, account deletion)
-- bypass RLS and are unaffected.
--
-- Idempotent: drop-then-create.
-- ═══════════════════════════════════════════════════════════════

drop policy if exists "own invoice payments" on public.invoice_payments;
create policy "own invoice payments" on public.invoice_payments
  for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_payments.invoice_id
        and i.user_id = auth.uid()
    )
  );

-- Verification — run after applying.
--
-- 1. Policy text now includes the invoice ownership check:
-- select policyname, cmd, qual, with_check
-- from pg_policies where tablename = 'invoice_payments';
--
-- 2. Any rows already written against another user's invoice (expect 0):
-- select p.id, p.invoice_id, p.user_id as payer, i.user_id as invoice_owner
-- from public.invoice_payments p
-- join public.invoices i on i.id = p.invoice_id
-- where p.user_id <> i.user_id;
