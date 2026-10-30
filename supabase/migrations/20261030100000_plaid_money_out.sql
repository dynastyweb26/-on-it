-- ═══════════════════════════════════════════════════════════════
-- Plaid money-out — PR 1: schema + RLS only (no Link, no sync, no routes).
--
--   1. plaid_items        one row per linked login (Plaid "item"): institution,
--                         encrypted access token, sync cursor, status.
--   2. plaid_accounts     the accounts inside an item, each with a track flag
--                         and tracked_at (the two move together).
--   3. bank_transactions  the canonical bank ledger: bank_state is what the bank
--                         says (pending / posted / removed), review_state is what
--                         the owner decided (new / added / already / ignored /
--                         needs_review). The UI's "Ignored" tab is
--                         review_state = 'ignored'. There is no "hidden" state.
--   4. expenses.plaid_transaction_id — nullable, unique per user. Expenses stay
--                         the only source for Spent / Net / recaps.
--   5. Access tokens are never readable by a client: bytea encrypted with
--      pgcrypto (SECURITY.md layer 5), read and written only through the two
--      service-role-only helpers, mirroring set_zelle / get_zelle.
--
-- Access model: owner-only RLS (auth.uid() = user_id), SELECT only for
-- authenticated, nothing for anon, all writes by the service role in the API
-- routes (which are the only caller that needs the token). Every user-owned row
-- cascades from profiles, so /api/delete-account removes them with the account
-- (the Plaid /item/remove call is app-side).
--
-- Additive only: new tables, a new nullable column, new indexes. Idempotent.
-- Verify after applying: npm run db:privcheck — section BB.
-- ═══════════════════════════════════════════════════════════════

-- 1 ── plaid_items ──────────────────────────────────────────────
create table if not exists public.plaid_items (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  plaid_item_id     text not null
                      check (char_length(plaid_item_id) between 1 and 120),
  institution_id    text
                      check (institution_id is null or char_length(institution_id) <= 120),
  institution_name  text
                      check (institution_name is null or char_length(institution_name) <= 200),
  -- pgp_sym_encrypt output. Never selected by a client role (column grant below).
  access_token_enc  bytea not null,
  -- /transactions/sync cursor. Only written after that page's rows committed,
  -- so a cursor without a completed sync is impossible.
  sync_cursor       text check (sync_cursor is null or char_length(sync_cursor) <= 1000),
  status            text not null default 'syncing'
                      check (status in ('syncing', 'active', 'needs_reconnect', 'removed')),
  linked_at         timestamptz not null default now(),
  last_synced_at    timestamptz,
  last_sync_error   text check (last_sync_error is null or char_length(last_sync_error) <= 400),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- A Plaid item id belongs to exactly one linked login, for one owner.
  constraint plaid_items_item_key unique (plaid_item_id),
  constraint plaid_items_cursor_chk check (sync_cursor is null or last_synced_at is not null)
);

create index if not exists plaid_items_user_idx
  on public.plaid_items (user_id, created_at desc);

-- 2 ── plaid_accounts ───────────────────────────────────────────
create table if not exists public.plaid_accounts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  item_id          uuid not null references public.plaid_items(id) on delete cascade,
  plaid_account_id text not null
                     check (char_length(plaid_account_id) between 1 and 120),
  name             text not null check (char_length(name) between 1 and 200),
  official_name    text check (official_name is null or char_length(official_name) <= 200),
  mask             text check (mask is null or char_length(mask) <= 12),
  type             text check (type is null or char_length(type) <= 40),
  subtype          text check (subtype is null or char_length(subtype) <= 40),
  -- Only tracked accounts produce bank_transactions.
  track            boolean not null default false,
  tracked_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint plaid_accounts_account_key unique (item_id, plaid_account_id),
  constraint plaid_accounts_track_chk check (track = (tracked_at is not null))
);

create index if not exists plaid_accounts_user_idx
  on public.plaid_accounts (user_id, item_id);

-- 3 ── bank_transactions ────────────────────────────────────────
create table if not exists public.bank_transactions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles(id) on delete cascade,
  item_id              uuid not null references public.plaid_items(id) on delete cascade,
  account_id           uuid not null references public.plaid_accounts(id) on delete cascade,
  plaid_transaction_id text not null
                         check (char_length(plaid_transaction_id) between 1 and 120),
  -- What the bank printed, and the normalised vendor matching compares.
  description          text not null check (char_length(description) between 1 and 300),
  merchant             text check (merchant is null or char_length(merchant) <= 200),
  -- Money OUT only, positive (Plaid's sign convention). Money in is out of scope.
  amount               numeric(12,2) not null check (amount >= 0),
  -- The posted date; an expense added from this transaction carries this date.
  occurred_on          date not null,
  authorized_on        date,
  category             text check (category is null or char_length(category) <= 60),
  bank_state           text not null default 'pending',
  review_state         text not null default 'new',
  -- Set when the transaction is added to the record or linked to an expense.
  expense_id           uuid references public.expenses(id) on delete set null,
  removed_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- Dedupe: one row per Plaid transaction id, per owner.
  constraint bank_transactions_txn_key unique (user_id, plaid_transaction_id),
  -- added / already always point at the expense they count as.
  constraint bank_transactions_link_chk
    check (review_state not in ('added', 'already') or expense_id is not null),
  constraint bank_transactions_removed_chk
    check ((bank_state = 'removed') = (removed_at is not null)),
  constraint bank_transactions_bank_state_chk
    check (bank_state in ('pending', 'posted', 'removed')),
  constraint bank_transactions_review_state_chk
    check (review_state in ('new', 'added', 'already', 'ignored', 'needs_review'))
);

create index if not exists bank_transactions_user_date_idx
  on public.bank_transactions (user_id, occurred_on desc);
-- The review stack's only query: what still needs the owner.
create index if not exists bank_transactions_open_idx
  on public.bank_transactions (user_id)
  where review_state in ('new', 'needs_review');
create index if not exists bank_transactions_expense_idx
  on public.bank_transactions (expense_id) where expense_id is not null;

-- 4 ── expenses ↔ bank_transactions ─────────────────────────────
alter table public.expenses add column if not exists plaid_transaction_id text;

alter table public.expenses
  drop constraint if exists expenses_plaid_transaction_len_chk;
alter table public.expenses
  add constraint expenses_plaid_transaction_len_chk
  check (plaid_transaction_id is null or char_length(plaid_transaction_id) between 1 and 120);

create unique index if not exists expenses_user_plaid_transaction_uidx
  on public.expenses (user_id, plaid_transaction_id)
  where plaid_transaction_id is not null;

-- 5 ── RLS: owner-only reads, no client writes ───────────────────
alter table public.plaid_items enable row level security;
alter table public.plaid_accounts enable row level security;
alter table public.bank_transactions enable row level security;

drop policy if exists "own plaid items select" on public.plaid_items;
create policy "own plaid items select" on public.plaid_items
  for select using (auth.uid() = user_id);

drop policy if exists "own plaid accounts select" on public.plaid_accounts;
create policy "own plaid accounts select" on public.plaid_accounts
  for select using (auth.uid() = user_id);

drop policy if exists "own bank transactions select" on public.bank_transactions;
create policy "own bank transactions select" on public.bank_transactions
  for select using (auth.uid() = user_id);

-- No INSERT / UPDATE / DELETE policy and no such privilege: sync and confirm
-- run on the service role, scoped by user_id in code. The token column is not
-- in the column grant, so even the owner's own session can never read it.
revoke all on public.plaid_items from anon, authenticated;
revoke all on public.plaid_accounts from anon, authenticated;
revoke all on public.bank_transactions from anon, authenticated;

grant select (id, user_id, plaid_item_id, institution_id, institution_name,
              status, linked_at, last_synced_at, last_sync_error, created_at, updated_at)
  on public.plaid_items to authenticated;
grant select on public.plaid_accounts to authenticated;
grant select on public.bank_transactions to authenticated;

grant select, insert, update, delete on public.plaid_items to service_role;
grant select, insert, update, delete on public.plaid_accounts to service_role;
grant select, insert, update, delete on public.bank_transactions to service_role;

revoke truncate on public.plaid_items, public.plaid_accounts, public.bank_transactions
  from anon, authenticated;

-- 5b ── Deleting an expense reopens its bank transaction ─────────
-- expense_id is ON DELETE SET NULL, but a decided row ('added' / 'already')
-- must point at an expense, so a bare SET NULL violates
-- bank_transactions_link_chk. Reopen it BEFORE the delete instead: the row is
-- nulled and sent to 'needs_review' in one UPDATE, so the CHECK holds
-- throughout and the owner is asked rather than silently losing the link.
-- SECURITY DEFINER because the owner has no UPDATE grant on
-- bank_transactions; the update is scoped to the expense being deleted.
-- Account teardown (profiles -> expenses) fires this too: rows of the same
-- account are either updated harmlessly or already gone.
create or replace function public.reopen_bank_transaction_on_expense_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.bank_transactions
    set expense_id = null,
        review_state = 'needs_review',
        updated_at = now()
    where expense_id = old.id
      and review_state in ('added', 'already');
  return old;
end $$;

revoke execute on function public.reopen_bank_transaction_on_expense_delete()
  from public, anon, authenticated;

drop trigger if exists reopen_bank_transaction_on_expense_delete on public.expenses;
create trigger reopen_bank_transaction_on_expense_delete
  before delete on public.expenses
  for each row execute function public.reopen_bank_transaction_on_expense_delete();

-- 5c ── expenses.plaid_transaction_id is server-written only ─────
-- A client that could set this column could fake the "Bank verified" tag and
-- route around the confirm endpoint. Only the service role (sync and confirm)
-- may set or change it; the owner keeps every other expense column.
create or replace function public.guard_expense_plaid_transaction()
returns trigger language plpgsql as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), current_user);
begin
  if (tg_op = 'INSERT' and new.plaid_transaction_id is not null)
     or (tg_op = 'UPDATE'
         and new.plaid_transaction_id is distinct from old.plaid_transaction_id) then
    if v_role not in ('service_role', 'postgres') then
      raise exception 'expenses.plaid_transaction_id is written by the bank sync only'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end $$;

revoke execute on function public.guard_expense_plaid_transaction()
  from public, anon, authenticated;

drop trigger if exists guard_expense_plaid_transaction on public.expenses;
create trigger guard_expense_plaid_transaction
  before insert or update on public.expenses
  for each row execute function public.guard_expense_plaid_transaction();

-- 6 ── Access-token helpers (service role only) ──────────────────
-- The key is passed from the server exactly like set_zelle: it lives in the
-- deployment's environment (PLAID_TOKEN_ENC_KEY), never in the database.
create or replace function public.set_plaid_access_token(p_item uuid, p_token text, p_key text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_token is null or char_length(p_token) = 0 then
    raise exception 'plaid: empty access token';
  end if;
  if p_key is null or char_length(p_key) = 0 then
    raise exception 'plaid: empty encryption key';
  end if;
  update plaid_items
    set access_token_enc = pgp_sym_encrypt(p_token, p_key),
        updated_at = now()
    where id = p_item;
  if not found then
    raise exception 'plaid: item not found';
  end if;
end $$;

create or replace function public.get_plaid_access_token(p_item uuid, p_key text)
returns text language sql security definer set search_path = public, extensions as $$
  select case when access_token_enc is null then null
              else pgp_sym_decrypt(access_token_enc, p_key) end
  from plaid_items where id = p_item;
$$;

revoke execute on function public.set_plaid_access_token(uuid, text, text)
  from public, anon, authenticated;
revoke execute on function public.get_plaid_access_token(uuid, text)
  from public, anon, authenticated;

grant execute on function public.set_plaid_access_token(uuid, text, text) to service_role;
grant execute on function public.get_plaid_access_token(uuid, text) to service_role;
