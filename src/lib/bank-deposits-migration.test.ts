// The money-in migration and its privilege checks, verified from the files we
// will apply — additive only, owner-read only, and every refusal in the guard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const MIGRATION = readFileSync(
  join(ROOT, 'supabase', 'migrations', '20261102190000_bank_deposits.sql'),
  'utf8',
);
const PRIVCHECK = readFileSync(join(ROOT, 'supabase', 'snippets', 'privilege_check.sql'), 'utf8');
const RESULT = readFileSync(join(ROOT, 'scripts', 'lib', 'privcheck-result.mjs'), 'utf8');

test('both tables exist with the columns the spec names, and nothing existing is altered', () => {
  assert.match(MIGRATION, /create table if not exists public\.bank_deposits/);
  assert.match(MIGRATION, /create table if not exists public\.bank_deposit_links/);
  for (const column of [
    'user_id', 'plaid_item_id', 'account_id', 'plaid_transaction_id', 'pending_transaction_id',
    'amount', 'occurred_on', 'name', 'merchant_name', 'pending', 'removed_at',
    'is_stripe_payout', 'created_at',
  ]) {
    assert.match(MIGRATION, new RegExp(`\\b${column}\\b`), `bank_deposits.${column}`);
  }
  assert.match(MIGRATION, /kind\s+text not null/);
  assert.match(MIGRATION, /created_at\s+timestamptz not null default now\(\)/);
  // The money-out table and the ledger are not touched at all.
  assert.doesNotMatch(MIGRATION, /alter table public\.bank_transactions/);
  assert.doesNotMatch(MIGRATION, /alter table public\.invoice_payments/);
});

test('a deposit is positive, unique per owner, and a link shape is enforced', () => {
  assert.match(MIGRATION, /amount\s+numeric\(12,2\) not null check \(amount > 0\)/);
  assert.match(MIGRATION, /unique \(user_id, plaid_transaction_id\)/);
  assert.match(
    MIGRATION,
    /check \(\(payment_id is not null\) = \(kind in \('recorded', 'linked'\)\)\)/,
  );
  assert.match(MIGRATION, /create unique index if not exists bank_deposit_links_payment_uidx/);
  assert.match(MIGRATION, /where payment_id is not null/);
});

test('owner SELECT only: RLS on, no write policy, no client write grant', () => {
  assert.match(MIGRATION, /alter table public\.bank_deposits enable row level security/);
  assert.match(MIGRATION, /alter table public\.bank_deposit_links enable row level security/);
  assert.match(MIGRATION, /for select using \(auth\.uid\(\) = user_id\)/);
  // No policy grants a write: the only "for insert/update" text is the trigger.
  assert.doesNotMatch(MIGRATION, /create policy[^;]*for (insert|update|delete|all)\b/i);
  assert.match(MIGRATION, /revoke all on public\.bank_deposits from anon, authenticated/);
  assert.match(MIGRATION, /revoke all on public\.bank_deposit_links from anon, authenticated/);
  assert.match(MIGRATION, /grant select on public\.bank_deposits to authenticated/);
});

test('the guard refuses payouts, conflicting decisions, other owners and over-sums', () => {
  assert.match(MIGRATION, /create or replace function public\.guard_bank_deposit_link\(\)/);
  assert.match(MIGRATION, /security definer/);
  assert.match(MIGRATION, /set search_path = ''/);
  assert.match(MIGRATION, /if v_deposit\.is_stripe_payout then/);
  assert.match(MIGRATION, /raise exception 'A Stripe payout is never new income'/);
  assert.match(MIGRATION, /l\.kind in \('stripe_payout', 'not_income'\)/);
  assert.match(MIGRATION, /if v_linked \+ v_this > v_deposit\.amount then/);
  assert.match(MIGRATION, /raise exception 'Payment does not belong to this owner'/);
  assert.match(MIGRATION, /before insert or update on public\.bank_deposit_links/);
  assert.match(MIGRATION, /revoke execute on function public\.guard_bank_deposit_link\(\)/);
});

test('only a plain manual payment can be linked: no Stripe row, no reversal', () => {
  // The guard loads exactly what it judges, not just the amount.
  assert.match(MIGRATION, /select p\.entry_type,/);
  assert.match(MIGRATION, /p\.amount,/);
  for (const column of [
    'stripe_checkout_session_id',
    'stripe_event_id',
    'stripe_payment_intent_id',
    'stripe_object_id',
    'reverses_payment_id',
  ]) {
    assert.match(MIGRATION, new RegExp(`p\\.${column}\\b`), column);
  }
  assert.match(MIGRATION, /into v_payment/);

  assert.match(MIGRATION, /v_payment\.entry_type <> 'payment'/);
  assert.match(MIGRATION, /v_payment\.amount <= 0/);
  const refusals = MIGRATION.match(
    /v_payment\.(?:stripe_\w+|reverses_payment_id) is not null/g,
  ) ?? [];
  assert.equal(refusals.length, 5, 'every Stripe and reversal column is refused');

  assert.match(MIGRATION, /raise exception 'Only a manual payment can be linked to a deposit'/);
  // The sum check uses the amount that was just validated.
  assert.match(MIGRATION, /v_this := v_payment\.amount;/);
});

test('the privilege check carries the new rows and requires them', () => {
  for (const id of ['BD1', 'BD2', 'BD3', 'BD4']) {
    assert.match(PRIVCHECK, new RegExp(`select '${id} `), `${id} SQL`);
    assert.match(RESULT, new RegExp(`'${id}'`), `${id} required`);
  }
  assert.match(PRIVCHECK, /version = '20261102190000'/);
});
