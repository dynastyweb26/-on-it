-- ═══════════════════════════════════════════════════════════════
-- invoice_payments: Stripe Checkout session id + lock Stripe-sourced rows.
--
-- The Connect webhook (/api/webhooks/stripe/connect, service role) records a
-- card payment made on the public pay page as a ledger row carrying the
-- Checkout Session id. Two jobs here:
--
-- 1. IDEMPOTENCY. stripe_checkout_session_id is UNIQUE; the webhook inserts
--    with ON CONFLICT (stripe_checkout_session_id) DO NOTHING, so a replayed
--    event — or both checkout.session.completed and
--    checkout.session.async_payment_succeeded for the same session — lands
--    exactly one row. (The older stripe_event_id column can't do this: the two
--    events have different ids.) Multiple NULLs are allowed, so manual rows
--    are unaffected.
--
-- 2. LOCK Stripe-sourced rows. A row is Stripe-sourced when
--    stripe_checkout_session_id (or the legacy stripe_event_id) is set. Users
--    must not be able to INSERT such a row (forging a "paid by card"), or
--    UPDATE / DELETE one (erasing a real payment). Manual rows — including
--    method = 'card' recorded through Record Payment, which never sets either
--    column — keep full owner access.
--
-- The single FOR ALL "own invoice payments" policy (20260918000000, tightened
-- by 20260924000000 to check invoice ownership) is split per command so each
-- carries the right condition. The invoice-ownership check from 20260924000000
-- is preserved on INSERT and UPDATE WITH CHECK.
--
-- Service role (the webhook) bypasses RLS and is unaffected. The ledger sync
-- trigger (SECURITY DEFINER) recomputes amount_paid/status for any insert.
--
-- Idempotent: add-column-if-not-exists, guarded constraint, drop-then-create
-- policies.
-- ═══════════════════════════════════════════════════════════════

-- 1 ── Column + shape backstop
alter table public.invoice_payments
  add column if not exists stripe_checkout_session_id text unique;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'invoice_payments_stripe_session_chk') then
    alter table public.invoice_payments
      add constraint invoice_payments_stripe_session_chk
      check (stripe_checkout_session_id is null
             or (stripe_checkout_session_id ~ '^cs_[A-Za-z0-9_]+$'
                 and char_length(stripe_checkout_session_id) <= 255));
  end if;
end $$;

-- 2 ── Split the FOR ALL policy per command
drop policy if exists "own invoice payments"        on public.invoice_payments;
drop policy if exists "own invoice payments select" on public.invoice_payments;
drop policy if exists "own invoice payments insert" on public.invoice_payments;
drop policy if exists "own invoice payments update" on public.invoice_payments;
drop policy if exists "own invoice payments delete" on public.invoice_payments;

-- SELECT: every own row, Stripe-sourced included (shown in payment history).
create policy "own invoice payments select" on public.invoice_payments
  for select
  using (auth.uid() = user_id);

-- INSERT: own row, own invoice, and never Stripe-sourced.
create policy "own invoice payments insert" on public.invoice_payments
  for insert
  with check (
    auth.uid() = user_id
    and stripe_checkout_session_id is null
    and stripe_event_id is null
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_payments.invoice_id
        and i.user_id = auth.uid()
    )
  );

-- UPDATE: only manual rows, and the result must still be a manual row on an
-- own invoice (can't stamp a session id onto a manual row, or repoint it).
create policy "own invoice payments update" on public.invoice_payments
  for update
  using (
    auth.uid() = user_id
    and stripe_checkout_session_id is null
    and stripe_event_id is null
  )
  with check (
    auth.uid() = user_id
    and stripe_checkout_session_id is null
    and stripe_event_id is null
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_payments.invoice_id
        and i.user_id = auth.uid()
    )
  );

-- DELETE: only manual rows.
create policy "own invoice payments delete" on public.invoice_payments
  for delete
  using (
    auth.uid() = user_id
    and stripe_checkout_session_id is null
    and stripe_event_id is null
  );

-- ── Verification — run after applying ─────────────────────────
--
-- 1. Column + constraints (expect the unique key and the _chk constraint):
-- select conname, pg_get_constraintdef(oid)
-- from pg_constraint where conrelid = 'public.invoice_payments'::regclass
-- order by conname;
--
-- 2. Policies: expect exactly the four "own invoice payments <cmd>" policies,
--    and NO "own invoice payments" FOR ALL policy.
-- select policyname, cmd, qual, with_check
-- from pg_policies where tablename = 'invoice_payments' order by policyname;
--
-- 3. Existing data untouched (expect 0 — nothing is Stripe-sourced yet):
-- select count(*) from public.invoice_payments
-- where stripe_checkout_session_id is not null or stripe_event_id is not null;
