-- ═══════════════════════════════════════════════════════════════
-- Remove the DELETE grant on invoices and expenses (soft-delete is the path).
--
-- 20260905000000 defined "own invoices" / "own expenses" as FOR ALL, which
-- includes DELETE. Soft-delete (deleted_at) is enforced only in the app UI, so
-- an authenticated owner could still issue a raw REST DELETE that hard-removes
-- the row, bypassing deleted_at and nulling vault_documents.invoice_id
-- (on delete set null). Split each FOR ALL policy into select/insert/update, so
-- DELETE is denied by default (no policy) for the authenticated/anon roles.
--
-- Verified safe: nothing in the app issues a real DELETE on these tables — both
-- soft-delete via `.update({ deleted_at })`. handleDeletePayment deletes
-- invoice_payments rows, a DIFFERENT table whose "own invoice payments" FOR ALL
-- policy is untouched and keeps working. Account deletion runs under the service
-- role (bypasses RLS) and via FK cascade, so it is unaffected.
--
-- Idempotent: drop-then-create each policy.
-- ═══════════════════════════════════════════════════════════════

-- ── invoices ─────────────────────────────────────────────────
drop policy if exists "own invoices" on public.invoices;

create policy "own invoices select" on public.invoices
  for select using (auth.uid() = user_id);

create policy "own invoices insert" on public.invoices
  for insert with check (auth.uid() = user_id);

create policy "own invoices update" on public.invoices
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── expenses ─────────────────────────────────────────────────
drop policy if exists "own expenses" on public.expenses;

create policy "own expenses select" on public.expenses
  for select using (auth.uid() = user_id);

create policy "own expenses insert" on public.expenses
  for insert with check (auth.uid() = user_id);

create policy "own expenses update" on public.expenses
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
