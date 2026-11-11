// The unattached-payment migration is additive: a payment with no invoice gets
// a home in other_income, the owner may write only their own MANUAL rows, and
// the invoice ledger is not touched. Read from the file itself so the policy
// shape and the SQL that ships cannot drift apart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), 'utf8');

const MIGRATION = read('supabase', 'migrations', '20261111120000_unattached_payment.sql');
const PRIVCHECK = read('supabase', 'snippets', 'privilege_check.sql');
const RESULT = read('scripts', 'lib', 'privcheck-result.mjs');
const INCOME_ROUTE = read('src', 'app', 'api', 'income', 'route.ts');

const policy = (name: string) => {
  const start = MIGRATION.indexOf(`create policy "${name}"`);
  assert.ok(start > 0, `${name} exists`);
  const end = MIGRATION.indexOf(';', start);
  return MIGRATION.slice(start, end);
};

// The DDL without its comments: the prose above the statements is allowed to
// describe what the migration refuses.
const SQL = MIGRATION.replace(/--[^\n]*/g, '');

test('the migration is additive: new nullable columns, nothing dropped or made strict', () => {
  assert.match(MIGRATION, /alter table public\.other_income\s*\n\s*add column if not exists method text,/);
  assert.match(MIGRATION, /add column if not exists idempotency_key text/);
  // A check on a NEW column is additive; a NOT NULL, a drop or a rename is not.
  assert.doesNotMatch(SQL, /drop column/i);
  assert.doesNotMatch(SQL, /rename/i);
  assert.doesNotMatch(SQL, /add column[^;]*not null/i);
  assert.doesNotMatch(SQL, /alter column/i);
  // The ledger, its key and its triggers stay exactly as they are.
  assert.doesNotMatch(SQL, /invoice_payments/);
});

test('the owner writes only their own manual rows', () => {
  const insert = policy('own other income insert');
  assert.match(insert, /for insert/);
  assert.match(insert, /auth\.uid\(\) = user_id/);
  assert.match(insert, /deposit_id is null/);
  assert.match(insert, /classification = 'other_income'/);
  assert.match(insert, /amount > 0/);

  const update = policy('own other income update');
  assert.match(update, /for update/);
  // Both sides: cannot update someone else's or a deposit's row, and cannot
  // turn own row into either.
  assert.equal((update.match(/auth\.uid\(\) = user_id/g) ?? []).length, 2, 'USING and WITH CHECK');
  assert.equal((update.match(/deposit_id is null/g) ?? []).length, 2, 'USING and WITH CHECK');
  // …and the result must still be an income row: re-classifying it is refused.
  assert.match(
    update,
    /with check \(\s*auth\.uid\(\) = user_id\s*and deposit_id is null\s*and classification = 'other_income'\s*\)/,
  );

  const del = policy('own other income delete');
  assert.match(del, /for delete/);
  assert.match(del, /auth\.uid\(\) = user_id and deposit_id is null/);
});

test('a deposit-decided row is never writable by a client', () => {
  // Every write policy carries the same boundary.
  for (const name of ['own other income insert', 'own other income update', 'own other income delete']) {
    assert.match(policy(name), /deposit_id is null/, name);
  }
  // And a client can only ever write rows that count as income.
  assert.match(policy('own other income insert'), /classification = 'other_income'/);
  assert.doesNotMatch(policy('own other income insert'), /customer_payment/);
});

test('one submission is one row', () => {
  assert.match(
    MIGRATION,
    /create unique index if not exists other_income_user_idempotency_key_uidx\s*\n\s*on public\.other_income \(user_id, idempotency_key\)\s*\n\s*where idempotency_key is not null/,
  );
});

test('the method vocabulary matches the payment card', () => {
  const check = MIGRATION.slice(
    MIGRATION.indexOf('other_income_method_chk'),
    MIGRATION.indexOf('other_income_idempotency_key_chk'),
  );
  for (const method of ['zelle', 'card', 'other', 'bank', 'paypal', 'venmo', 'cashapp']) {
    assert.ok(check.includes(`'${method}'`), method);
  }
  // Legacy rows still read.
  assert.ok(check.includes("'cash'"));
  assert.ok(check.includes("'check'"));
});

test('the privilege check carries the new policy shape and the key index', () => {
  assert.match(PRIVCHECK, /select 'BD5 other income rls'/);
  assert.match(PRIVCHECK, /select 'BD9 other income idempotency'/);
  assert.match(PRIVCHECK, /version = '20261111120000'/);
  assert.match(PRIVCHECK, /p\.cmd = 'INSERT'[\s\S]*?deposit_id is null/);
  assert.match(PRIVCHECK, /other_income_user_idempotency_key_uidx/);
  assert.match(RESULT, /'BD9'/);
});

test('/api/income is left on the service role in this branch', () => {
  // The founder's decision: do not move it. It is listed for the admin-client
  // review instead.
  assert.match(INCOME_ROUTE, /adminClient/);
});
