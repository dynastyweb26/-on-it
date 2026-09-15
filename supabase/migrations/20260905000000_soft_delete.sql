-- ═══════════════════════════════════════════════════════════════
-- Soft delete support for invoices and expenses.
-- ═══════════════════════════════════════════════════════════════

-- 1. Add deleted_at timestamptz column to invoices and expenses
alter table public.invoices
  add column if not exists deleted_at timestamptz;

alter table public.expenses
  add column if not exists deleted_at timestamptz;

-- 2. Indexes for soft-delete queries (filtering deleted_at IS NULL)
create index if not exists invoices_user_active_idx on public.invoices (user_id)
  where deleted_at is null;

create index if not exists expenses_user_active_idx on public.expenses (user_id)
  where deleted_at is null;

-- 3. RLS policies allowing owners to select, insert, update (soft-delete / restore), and delete
drop policy if exists "own invoices" on public.invoices;
create policy "own invoices" on public.invoices
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own expenses" on public.expenses;
create policy "own expenses" on public.expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
