// Guards the one-way contract between the app's state lists and the database:
// if either side changes a value, this fails before the mismatch can reach the
// sync or the confirm endpoint.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BANK_STATES,
  REVIEW_STATES,
  holdsExpense,
  isBankChange,
  isOpenReviewState,
  vendorOf,
} from './bank-ledger';

const SQL = readFileSync(
  new URL('../../supabase/migrations/20261030100000_plaid_money_out.sql', import.meta.url),
  'utf8',
);

const quoted = (values: readonly string[]) => values.map((v) => `'${v}'`);

test('bank and review states mirror the migration checks', () => {
  for (const state of BANK_STATES) assert.ok(SQL.includes(`'${state}'`), `bank_state ${state}`);
  for (const state of REVIEW_STATES) assert.ok(SQL.includes(`'${state}'`), `review_state ${state}`);
  // The UI's Ignored tab is review_state 'ignored'; SPEC's hidden queue is gone.
  assert.equal(SQL.includes("'hidden'"), false);
  assert.deepEqual([...BANK_STATES], ['pending', 'posted', 'removed']);
  assert.deepEqual([...REVIEW_STATES], ['new', 'added', 'already', 'ignored', 'needs_review']);
  // The review stack's open set.
  assert.deepEqual(REVIEW_STATES.filter(isOpenReviewState), ['new', 'needs_review']);
});

test('only added and already hold an expense', () => {
  assert.deepEqual(REVIEW_STATES.filter(holdsExpense), ['added', 'already']);
  assert.equal(holdsExpense('ignored'), false);
  // The DB enforces the same thing for the two decided states.
  assert.ok(SQL.includes("review_state not in ('added', 'already') or expense_id is not null"));
});

test('every bank table is owner-only RLS with no client write policy', () => {
  for (const table of ['plaid_items', 'plaid_accounts', 'bank_transactions']) {
    assert.ok(
      SQL.includes(`alter table public.${table} enable row level security`),
      `${table} RLS`,
    );
  }
  assert.equal((SQL.match(/for select using \(auth\.uid\(\) = user_id\)/g) ?? []).length, 3);
  assert.equal(/for (insert|update|delete or)/.test(SQL), false);
  assert.ok(SQL.includes('revoke all on public.bank_transactions from anon, authenticated'));
});

test('the access token is never in a client grant', () => {
  assert.ok(SQL.includes('access_token_enc  bytea not null'));
  const grant = SQL.slice(SQL.indexOf('grant select (id, user_id'), SQL.indexOf('on public.plaid_items to authenticated'));
  assert.equal(grant.includes('access_token_enc'), false);
  assert.ok(SQL.includes('revoke execute on function public.get_plaid_access_token'));
});

test('expenses link to a bank transaction without changing existing rows', () => {
  assert.ok(SQL.includes('add column if not exists plaid_transaction_id text'));
  assert.ok(SQL.includes('expenses_user_plaid_transaction_uidx'));
  assert.ok(SQL.includes('where plaid_transaction_id is not null'));
});

test('builder helpers', () => {
  assert.equal(vendorOf({ merchant: '  Costco Wholesale ', description: 'COSTCO #123' }), 'Costco Wholesale');
  assert.equal(vendorOf({ merchant: null, description: ' COSTCO #123 ' }), 'COSTCO #123');
  assert.equal(isBankChange('removed'), true);
  assert.equal(isBankChange('posted'), false);
  assert.deepEqual(quoted([...BANK_STATES]).length, 3);
});
