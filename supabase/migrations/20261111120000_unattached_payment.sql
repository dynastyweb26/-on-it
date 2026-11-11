-- ═══════════════════════════════════════════════════════════════
-- MONEY IN — a payment with no invoice behind it.
-- ADDITIVE ONLY: two nullable columns on other_income, a check on each new
-- column, one partial unique index, and the write policies the owner needs to
-- type that payment in from the app. The ledger, its triggers, its idempotency
-- index and /api/income are not touched.
--
-- Why other_income and not a third table: it already is the home for money
-- received that is not a customer paying an invoice, and every Collected
-- reader (Books, Summary, Income) already sums it beside the ledger. A second
-- home would need every reader changed a second time.
--
-- method: how the money arrived. Null on every existing row — a deposit's
-- method is the bank's, and a hand-typed other-income row never had one. The
-- values are the ledger's set plus the legacy cash/check, so one payment
-- vocabulary reads both tables the same way.
--
-- idempotency_key: one key per submission, minted by the client at the tap and
-- reused by every retry. The partial unique index is the rule: a retry writes
-- one row. Deposit rows leave it null, so the index never affects them, and a
-- repeat is read back by (user_id, key) rather than by an invoice.
--
-- Access model: the owner may write their own MANUAL rows (deposit_id is
-- null). A row a bank deposit decided stays server-written, because its amount
-- and its existence are that deposit's decision — the deposit guards and
-- unique indexes still count the row after a soft delete, so a client must not
-- be able to hide or reshape it. Code deletes with deleted_at; the policy
-- permits exactly that row operation and nothing broader.
--
-- Idempotent. Verify after applying: npm run db:privcheck — BD5, BD9.
-- ═══════════════════════════════════════════════════════════════

alter table public.other_income
  add column if not exists method text,
  add column if not exists idempotency_key text;

alter table public.other_income
  drop constraint if exists other_income_method_chk;
alter table public.other_income
  add constraint other_income_method_chk
  check (method is null or method in (
    'zelle', 'cash', 'check', 'card', 'other', 'bank', 'paypal', 'venmo', 'cashapp'
  ));

alter table public.other_income
  drop constraint if exists other_income_idempotency_key_chk;
alter table public.other_income
  add constraint other_income_idempotency_key_chk
  check (idempotency_key is null or char_length(idempotency_key) between 1 and 120);

-- One submission is one row. Deposit rows are null and stay outside the index.
create unique index if not exists other_income_user_idempotency_key_uidx
  on public.other_income (user_id, idempotency_key)
  where idempotency_key is not null;

-- ── The owner's write policies — manual rows only ──────────────
drop policy if exists "own other income insert" on public.other_income;
create policy "own other income insert" on public.other_income
  for insert
  with check (
    auth.uid() = user_id
    and deposit_id is null
    and classification = 'other_income'
    and amount > 0
  );

drop policy if exists "own other income update" on public.other_income;
create policy "own other income update" on public.other_income
  for update
  using (auth.uid() = user_id and deposit_id is null)
  with check (auth.uid() = user_id and deposit_id is null);

drop policy if exists "own other income delete" on public.other_income;
create policy "own other income delete" on public.other_income
  for delete
  using (auth.uid() = user_id and deposit_id is null);

grant insert, update, delete on public.other_income to authenticated;
revoke truncate on public.other_income from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════
-- Verification — run after applying.
--
-- 1. RLS on; one owner SELECT policy; INSERT, UPDATE and DELETE policies that
--    all require auth.uid() = user_id and deposit_id is null; insert also
--    requires classification = 'other_income' and amount > 0 (privcheck BD5).
-- 2. other_income_user_idempotency_key_uidx is unique, partial, on
--    (user_id, idempotency_key), and method exists (privcheck BD9).
-- 3. Boundary cases (in a transaction you roll back):
--    • a client inserting a manual row for itself            → succeeds
--    • a client inserting a row with a deposit_id            → refused (RLS)
--    • a client inserting for another user_id                → refused (RLS)
--    • a client inserting classification 'vendor_refund'      → refused (RLS + check)
--    • a client updating or deleting a deposit-linked row     → 0 rows
--    • the same (user_id, idempotency_key) twice              → refused (23505)
--    • two rows with a null key                               → allowed
-- ═══════════════════════════════════════════════════════════════
