// The write and read policies, executed against an in-memory Postgres with
// Supabase's roles and auth.uid() stubbed. Both real migration files are
// applied as written, so the guarantees are proven rather than pattern-matched.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const read = (name: string) =>
  readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');

const BASE = read('20261103000001_other_income.sql');
const MIGRATION = read('20261111120000_unattached_payment.sql');

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const DEPOSIT = '99999999-9999-9999-9999-999999999999';

let db: PGlite;
let manualA = '';
let manualB = '';
let depositA = '';

async function seed(
  userId: string,
  title: string,
  key: string | null,
  depositId: string | null,
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.other_income
       (user_id, amount, title, received_on, classification, method, idempotency_key, deposit_id)
     values ($1, 100.00, $2, '2026-11-11', 'other_income', 'zelle', $3, $4)
     returning id`,
    [userId, title, key, depositId],
  );
  return rows[0].id;
}

before(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create extension if not exists pgcrypto;
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create schema if not exists auth;
    grant usage on schema auth to anon, authenticated, service_role;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create table public.profiles (id uuid primary key);
    create table public.bank_deposits (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references public.profiles(id) on delete cascade
    );
    grant usage on schema public to anon, authenticated, service_role;
    insert into public.profiles (id) values ('${A}'), ('${B}');
    insert into public.bank_deposits (id, user_id) values ('${DEPOSIT}', '${A}');
  `);
  await db.exec(BASE);
  await db.exec(MIGRATION);

  manualA = await seed(A, 'Side job', 'income-a', null);
  manualB = await seed(B, 'Their job', 'income-b', null);
  depositA = await seed(A, 'Bank deposit', null, DEPOSIT);
});

after(async () => {
  await db.close();
});

/** Run one statement as the signed-in owner (RLS applies; no service role). */
async function as<T>(userId: string, sql: string, params: unknown[] = []) {
  await db.exec('set role authenticated');
  try {
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);
    return await db.query<T>(sql, params);
  } finally {
    await db.exec('reset role');
  }
}

const MANUAL_INSERT = `insert into public.other_income
  (user_id, amount, title, received_on, classification, method, idempotency_key, deposit_id)
  values ($1, 25.00, 'Cash job', '2026-11-12', $2, 'other', $3, $4)
  returning id`;

test('a user reads only their own rows', async () => {
  const { rows } = await as<{ id: string }>(A, 'select id from public.other_income');
  const ids = rows.map((r) => r.id);
  assert.ok(ids.includes(manualA), 'own manual row');
  assert.ok(ids.includes(depositA), 'own deposit-decided row');
  assert.equal(ids.includes(manualB), false, 'another owner is invisible');
});

test('a user saves a manual payment for themselves, with no invoice', async () => {
  const { rows } = await as<{ id: string }>(A, MANUAL_INSERT, [A, 'other_income', 'fresh-key', null]);
  assert.equal(rows.length, 1);
  // There is no invoice column to require.
  const { rows: columns } = await db.query<{ column_name: string }>(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'other_income'`,
  );
  assert.equal(columns.some((c) => c.column_name.includes('invoice')), false);
});

test('a user cannot insert for another owner', async () => {
  await assert.rejects(
    as(A, MANUAL_INSERT, [B, 'other_income', 'cross-owner', null]),
    /row-level security|policy/i,
  );
});

test('a user cannot insert a non-income row', async () => {
  await assert.rejects(
    as(A, MANUAL_INSERT, [A, 'customer_payment', 'wrong-class', null]),
    /row-level security|policy/i,
  );
});

test('a user cannot insert a row a bank deposit owns', async () => {
  await assert.rejects(
    as(A, MANUAL_INSERT, [A, 'other_income', 'deposit-row', DEPOSIT]),
    /row-level security|policy|duplicate/i,
  );
});

test('a deposit-decided row cannot be edited or deleted by a client', async () => {
  const updated = await as(A,
    `update public.other_income set amount = 500 where id = $1 returning id`, [depositA]);
  assert.equal(updated.rows.length, 0, 'update refused by the policy');
  const deleted = await as(A,
    `delete from public.other_income where id = $1 returning id`, [depositA]);
  assert.equal(deleted.rows.length, 0, 'delete refused by the policy');
});

test('another owner cannot edit or delete a manual row', async () => {
  const updated = await as(B,
    `update public.other_income set amount = 500 where id = $1 returning id`, [manualA]);
  assert.equal(updated.rows.length, 0);
  const deleted = await as(B,
    `delete from public.other_income where id = $1 returning id`, [manualA]);
  assert.equal(deleted.rows.length, 0);
});

test('a client cannot re-classify a manual row', async () => {
  const { rows } = await as<{ id: string }>(A, MANUAL_INSERT, [A, 'other_income', 'class-key', null]);
  const id = rows[0].id;

  // Each of these would take the row out of Collected, so the update refuses.
  for (const value of ['customer_payment', 'vendor_refund', 'transfer', 'unknown']) {
    await assert.rejects(
      as(A, `update public.other_income set classification = $1 where id = $2 returning id`, [value, id]),
      /row-level security|policy/i,
      value,
    );
  }

  const { rows: after } = await db.query<{ classification: string }>(
    `select classification from public.other_income where id = $1`,
    [id],
  );
  assert.equal(after[0].classification, 'other_income', 'the row still counts');
});

test('the owner can soft-delete and restore their own manual row', async () => {
  const { rows } = await as<{ id: string }>(A, MANUAL_INSERT, [A, 'other_income', 'undo-key', null]);
  const id = rows[0].id;

  const hidden = await as(A,
    `update public.other_income set deleted_at = now() where id = $1 returning id`, [id]);
  assert.equal(hidden.rows.length, 1);

  const restored = await as(A,
    `update public.other_income set deleted_at = null where id = $1 returning id`, [id]);
  assert.equal(restored.rows.length, 1);
});

test('a replayed save is refused, so one submission is one row', async () => {
  const first = await as<{ id: string }>(A, MANUAL_INSERT, [A, 'other_income', 'replay-key', null]);
  assert.equal(first.rows.length, 1);
  await assert.rejects(
    as(A, MANUAL_INSERT, [A, 'other_income', 'replay-key', null]),
    /duplicate key|unique/i,
  );
  const { rows } = await db.query<{ count: string }>(
    `select count(*) from public.other_income where idempotency_key = 'replay-key'`,
  );
  assert.equal(Number(rows[0].count), 1);
});
