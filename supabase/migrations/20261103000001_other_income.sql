-- ═══════════════════════════════════════════════════════════════
-- MONEY IN — other income. ADDITIVE ONLY: one new table, its indexes and
-- its owner-read policy. Nothing existing is altered, no constraint is added
-- to a table that already exists, and invoice_payments is not touched.
--
-- Why a second table and not invoice_payments: other income is money the
-- owner received that is not a customer paying an invoice — a vendor refund,
-- a job paid outside On It, a family loan. Writing it to the ledger would
-- loosen the ledger's shape (it needs an invoice) and put non-invoice money
-- through the invoice readers. So it is its own table and every Collected
-- reader sums it beside invoice_payments.
--
-- classification: 'customer_payment' | 'other_income' ONLY. Those are the two
-- that count in Collected, so the check is the rule — there is no row in this
-- table that does not count, and no reader needs a filter that could drift.
-- A non-income classification (vendor_refund, transfer, loan_or_owner,
-- unknown) is NOT stored here: it is a decision on the deposit, in
-- bank_deposit_links.classification, and it counts in no total at all.
--
-- deposit_id: set when this row is how a bank deposit was decided. Null for a
-- row the owner types in. Unique where not null — one deposit can never become
-- two incomes. Deleting the deposit does not delete this row: the money
-- arrived, so it stands counting, unlinked. The guard trigger on the links table (see
-- 20261103000002_deposit_classification.sql) refuses the other direction, so a
-- deposit has one decision across both tables.
--
-- Access model: owner-only SELECT via RLS, writes on the service role in
-- /api/plaid/deposits. No INSERT/UPDATE/DELETE policy and no such grant.
--
-- Idempotent. Verify after applying: npm run db:privcheck — section BD5/BD6.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.other_income (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  -- Money in, so positive. numeric(12,2), like every other amount in the app.
  amount         numeric(12,2) not null check (amount > 0),
  -- What it was. Required: an unlabelled income row is not a record.
  title          text not null check (char_length(title) between 1 and 200),
  client_name    text check (client_name is null or char_length(client_name) <= 120),
  -- The day the money arrived; Collected is cash basis, so this is the date.
  received_on    date not null,
  note           text check (note is null or char_length(note) <= 1000),
  -- Null for an entry the owner made, and for a row whose deposit was deleted.
  -- The money still arrived, so the row stands and stops pointing at a
  -- deposit: cascading here would take income out of Collected because a bank
  -- connection was removed.
  deposit_id     uuid references public.bank_deposits(id) on delete set null,
  classification text not null
                   check (classification in ('customer_payment', 'other_income')),
  created_at     timestamptz not null default now(),
  -- Soft delete only. A deleted row counts in no total.
  deleted_at     timestamptz
);

-- One deposit becomes at most one income row, ever.
create unique index if not exists other_income_deposit_uidx
  on public.other_income (deposit_id) where deposit_id is not null;

-- The Collected read: this owner's live rows, newest first.
create index if not exists other_income_user_date_idx
  on public.other_income (user_id, received_on desc) where deleted_at is null;

-- Ownership is checked again on every write in code; this index makes the
-- deposit-side lookups (the links guard) cheap.
create index if not exists other_income_user_idx
  on public.other_income (user_id);

alter table public.other_income enable row level security;

drop policy if exists "own other income select" on public.other_income;
create policy "own other income select" on public.other_income
  for select using (auth.uid() = user_id);

-- No write policy and no write grant: the deposit route runs on the service
-- role and scopes every row to user.id.
revoke all on public.other_income from anon, authenticated;
grant select on public.other_income to authenticated;
grant select, insert, update, delete on public.other_income to service_role;
revoke truncate on public.other_income from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════
-- Verification — run after applying.
--
-- 1. RLS on, exactly one owner SELECT policy, no write policy, and a client
--    cannot INSERT (privcheck BD5).
-- 2. other_income_deposit_uidx is unique and partial (privcheck BD6).
-- 3. Boundary cases (in a transaction you roll back):
--    • amount 0 or negative                    → refused
--    • classification 'vendor_refund'          → refused (not this table)
--    • two rows with the same deposit_id       → refused (unique index)
--    • two rows with deposit_id null           → allowed (manual entries)
--    • deleting the deposit keeps the row, deposit_id null → yes
-- ═══════════════════════════════════════════════════════════════
