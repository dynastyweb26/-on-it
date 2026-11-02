// Executes the real migration against an in-memory Postgres (PGlite) with the
// Supabase roles and auth.uid() stubbed, so the schema's guarantees are proven
// by running them rather than by matching strings in the SQL file.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const MIGRATION = readFileSync(
  new URL('../../supabase/migrations/20261030100000_plaid_money_out.sql', import.meta.url),
  'utf8',
);

const KEY = 'schema-test-key-not-a-secret';
const OWNER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';

let db: PGlite;
let seq = 0;

before(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create extension if not exists pgcrypto;
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create schema if not exists auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create table public.profiles (id uuid primary key);
    create table public.expenses (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references public.profiles(id) on delete cascade,
      description text not null default 'expense',
      amount numeric(12,2) not null default 0 check (amount >= 0),
      spent_on date not null default current_date
    );
    grant usage on schema public to anon, authenticated, service_role;
    grant select, insert, update, delete on public.expenses to authenticated, service_role;
    insert into public.profiles (id) values ('${OWNER}'), ('${OTHER}');
    select set_config('request.jwt.claim.sub', '${OWNER}', false);
  `);
  // The whole point: the file has to apply as written.
  await db.exec(MIGRATION);
});

after(async () => {
  await db.close();
});

const rows = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  (await db.query<T>(sql, params)).rows;

const as = async <T>(role: string, sql: string, params: unknown[] = []) => {
  await db.exec(`set role ${role}`);
  try {
    return await db.query<T>(sql, params);
  } finally {
    await db.exec('reset role');
  }
};

/** One item + tracked account + expense + bank transaction for `user`. */
async function seed(user = OWNER, reviewState: 'added' | 'already' = 'added') {
  const n = ++seq;
  const [item] = await rows<{ id: string }>(
    `select public.create_plaid_item($1, $2, 'ins_1', 'Chase', $3, $4) as id`,
    [user, `item-${n}`, `access-token-${n}`, KEY],
  );
  const [account] = await rows<{ id: string }>(
    `insert into public.plaid_accounts (user_id, item_id, plaid_account_id, name, track, tracked_at)
     values ($1, $2, $3, 'Business Checking', true, now()) returning id`,
    [user, item.id, `acct-${n}`],
  );
  const [expense] = await rows<{ id: string }>(
    `insert into public.expenses (user_id, description, amount) values ($1, 'Costco', 30.38) returning id`,
    [user],
  );
  const [txn] = await rows<{ id: string }>(
    `insert into public.bank_transactions
       (user_id, item_id, account_id, plaid_transaction_id, description, merchant, amount,
        occurred_on, review_state, expense_id)
     values ($1, $2, $3, $4, 'COSTCO #123', 'Costco Wholesale', 30.38, '2026-10-27', $5, $6)
     returning id`,
    [user, item.id, account.id, `txn-${n}`, reviewState, expense.id],
  );
  return { item: item.id, account: account.id, expense: expense.id, txn: txn.id };
}

test('the migration applies and every bank table is RLS-protected', async () => {
  const tables = await rows<{ relname: string; relrowsecurity: boolean }>(
    `select relname, relrowsecurity from pg_class
     where relname in ('plaid_items', 'plaid_accounts', 'bank_transactions') order by relname`,
  );
  assert.equal(tables.length, 3);
  assert.ok(tables.every((t) => t.relrowsecurity), 'RLS enabled on all three');
  const policies = await rows<{ count: number }>(
    `select count(*)::int as count from pg_policies
     where schemaname = 'public' and cmd = 'SELECT'
       and tablename in ('plaid_items', 'plaid_accounts', 'bank_transactions')`,
  );
  assert.equal(policies[0].count, 3);
});

test('an access token round-trips and a wrong key fails', async () => {
  const { item } = await seed();
  const [back] = await rows<{ token: string }>(
    `select public.get_plaid_access_token($1, $2) as token`, [item, KEY],
  );
  assert.equal(back.token, `access-token-${seq}`);

  const [stored] = await rows<{ enc: Uint8Array }>(
    `select access_token_enc as enc from public.plaid_items where id = $1`, [item],
  );
  assert.equal(Buffer.from(stored.enc).includes(Buffer.from('access-token-')), false);

  await assert.rejects(
    rows(`select public.get_plaid_access_token($1, $2)`, [item, 'wrong-key']),
    /wrong key|corrupt/i,
  );
});

test('clients cannot read the token column or write the bank tables', async () => {
  const { item, account } = await seed();

  await assert.rejects(
    as('authenticated', `select access_token_enc from public.plaid_items`),
    /permission denied/i,
  );
  await assert.rejects(as('anon', `select id from public.plaid_items`), /permission denied/i);

  // But the owner's own session can read everything else, scoped by RLS:
  // its own rows are visible (this and earlier seeds), nobody else's are.
  const visible = await as<{ id: string; user_id: string }>(
    'authenticated', `select id, user_id from public.plaid_items`);
  assert.ok(visible.rows.some((r) => r.id === item));
  assert.ok(visible.rows.every((r) => r.user_id === OWNER));

  await assert.rejects(
    as('authenticated',
      `insert into public.bank_transactions (user_id, item_id, account_id, plaid_transaction_id, description, amount, occurred_on)
       values ($1, $2, $3, 'forged', 'x', 1, '2026-10-27')`,
      [OWNER, item, account]),
    /permission denied/i,
  );
  await assert.rejects(
    as('authenticated', `update public.plaid_accounts set track = true`),
    /permission denied/i,
  );
});

test('deleting a linked expense reopens the bank transaction', async () => {
  const { expense, txn } = await seed(OWNER, 'added');
  await as('authenticated', `delete from public.expenses where id = $1`, [expense]);

  const [row] = await rows<{ review_state: string; expense_id: string | null }>(
    `select review_state, expense_id from public.bank_transactions where id = $1`, [txn],
  );
  assert.equal(row.review_state, 'needs_review');
  assert.equal(row.expense_id, null);
});

test('deleting a profile cascades through every bank table', async () => {
  await seed(OTHER, 'already');
  await rows(`delete from public.profiles where id = $1`, [OTHER]);

  const [left] = await rows<{ items: number; accounts: number; txns: number; expenses: number }>(
    `select
       (select count(*)::int from public.plaid_items where user_id = $1) as items,
       (select count(*)::int from public.plaid_accounts where user_id = $1) as accounts,
       (select count(*)::int from public.bank_transactions where user_id = $1) as txns,
       (select count(*)::int from public.expenses where user_id = $1) as expenses`,
    [OTHER],
  );
  assert.deepEqual(left, { items: 0, accounts: 0, txns: 0, expenses: 0 });
});

test('only the service role may set plaid_transaction_id on an expense', async () => {
  const { expense } = await seed();

  // Ordinary edits by the owner are untouched.
  await as('authenticated', `update public.expenses set amount = 31.00 where id = $1`, [expense]);
  await assert.rejects(
    as('authenticated',
      `update public.expenses set plaid_transaction_id = 'txn-forged' where id = $1`,
      [expense]),
    /bank sync only/i,
  );
  await as('service_role',
    `update public.expenses set plaid_transaction_id = 'txn-real' where id = $1`, [expense]);

  const [row] = await rows<{ plaid_transaction_id: string; amount: string }>(
    `select plaid_transaction_id, amount from public.expenses where id = $1`, [expense],
  );
  assert.equal(row.plaid_transaction_id, 'txn-real');
  assert.equal(Number(row.amount), 31);
});

test('create_plaid_item is service-role only and stores the token encrypted', async () => {
  await assert.rejects(
    as('authenticated',
      `select public.create_plaid_item($1, 'item-forged', 'i', 'Bank', 'tok', $2)`,
      [OWNER, KEY]),
    /permission denied/i,
  );

  const created = await as<{ id: string }>('service_role',
    `select public.create_plaid_item($1, 'item-created', 'i', 'Bank', 'tok', $2) as id`,
    [OWNER, KEY]);
  const id = created.rows[0].id;
  const [row] = await rows<{ token: string; enc: Uint8Array }>(
    `select public.get_plaid_access_token($1, $2) as token,
            access_token_enc as enc from public.plaid_items where id = $1`, [id, KEY],
  );
  assert.equal(row.token, 'tok');
  assert.ok(row.enc.length > 0);
});
