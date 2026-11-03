// Round 1 of Money In: other income gets its own table (additive), and the
// deposit decision changes shape (changing). Read from the files we will apply,
// so neither can drift without a failing test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), 'utf8');

const ADDITIVE = read('supabase', 'migrations', '20261103000001_other_income.sql');
const CHANGING = read('supabase', 'migrations', '20261103000002_deposit_classification.sql');
const PRIVCHECK = read('supabase', 'snippets', 'privilege_check.sql');
const RESULT = read('scripts', 'lib', 'privcheck-result.mjs');

// ── The additive half ──────────────────────────────────────────────────────

test('the additive file adds one table and alters nothing that exists', () => {
  assert.match(ADDITIVE, /create table if not exists public\.other_income/);
  // Additive means: no constraint and no column is added to a live table.
  assert.doesNotMatch(ADDITIVE, /alter table public\.(?!other_income)\w+/);
  assert.doesNotMatch(ADDITIVE, /alter table public\.invoice_payments/);
  assert.doesNotMatch(ADDITIVE, /alter table public\.bank_deposit_links/);
  assert.doesNotMatch(ADDITIVE, /alter table public\.bank_deposits/);
});

test('other_income has exactly the columns the spec names', () => {
  for (const column of [
    'id', 'user_id', 'amount', 'title', 'client_name', 'received_on', 'note',
    'deposit_id', 'classification', 'created_at', 'deleted_at',
  ]) {
    assert.match(ADDITIVE, new RegExp(`^\\s+${column}\\s`, 'm'), `other_income.${column}`);
  }
  // Money in is positive; money is never a float.
  assert.match(ADDITIVE, /amount\s+numeric\(12,2\) not null check \(amount > 0\)/);
  // client_name, note and deposit_id are the nullable ones.
  assert.match(ADDITIVE, /client_name\s+text check \(client_name is null/);
  assert.match(ADDITIVE, /deposit_id\s+uuid references public\.bank_deposits\(id\)/);
});

test('only the two counting classifications can be stored in other_income', () => {
  assert.match(ADDITIVE, /classification in \('customer_payment', 'other_income'\)/);
  // The four non-income values are a deposit decision, not a row here.
  for (const value of ['vendor_refund', 'transfer', 'loan_or_owner', 'unknown']) {
    assert.doesNotMatch(ADDITIVE, new RegExp(`classification in \\([^)]*'${value}'`), value);
  }
});

test('a deposit becomes at most one income row, and collections are index-backed', () => {
  assert.match(ADDITIVE, /create unique index if not exists other_income_deposit_uidx/);
  assert.match(ADDITIVE, /on public\.other_income \(deposit_id\) where deposit_id is not null/);
  assert.match(ADDITIVE, /other_income_user_date_idx/);
});

test('other_income is owner-read only, with service-role writes', () => {
  assert.match(ADDITIVE, /alter table public\.other_income enable row level security/);
  assert.match(ADDITIVE, /create policy "own other income select"/);
  assert.match(ADDITIVE, /for select using \(auth\.uid\(\) = user_id\)/);
  // No write policy at all: the route runs on the service role.
  assert.doesNotMatch(ADDITIVE, /create policy[^;]*for (insert|update|delete|all)\b/i);
  assert.match(ADDITIVE, /revoke all on public\.other_income from anon, authenticated/);
  assert.match(ADDITIVE, /grant select on public\.other_income to authenticated/);
  assert.match(ADDITIVE, /grant select, insert, update, delete on public\.other_income to service_role/);
});

// ── The changing half ──────────────────────────────────────────────────────

test('the kind set drops "not_income" and keeps "stripe_payout"', () => {
  assert.match(
    CHANGING,
    /check \(kind in \('recorded', 'linked', 'classified', 'ignored', 'stripe_payout'\)\)/,
  );
  // The new check itself never admits the retired kind.
  assert.doesNotMatch(CHANGING, /kind in \([^)]*'not_income'/);
  // …but a sure payout keeps its own kind, so Ignored can explain itself.
  assert.match(CHANGING, /stripe_payout/);
});

test('existing not_income rows are carried to ignored before the check changes', () => {
  const update = CHANGING.indexOf("set kind = 'ignored'");
  const check = CHANGING.indexOf('bank_deposit_links_kind_check');
  assert.ok(update > 0, 'the backfill exists');
  assert.ok(check > update, 'the backfill runs before the new constraint');
  assert.match(CHANGING, /where kind = 'not_income'/);
});

test('classification is required iff the link is classified', () => {
  assert.match(CHANGING, /add column if not exists classification text/);
  assert.match(
    CHANGING,
    /classification in \(\s*'customer_payment', 'vendor_refund', 'transfer', 'loan_or_owner',\s*'other_income', 'unknown'\s*\)/,
  );
  assert.match(
    CHANGING,
    /check \(\(classification is not null\) = \(kind = 'classified'\)\)/,
  );
  // A classified link never carries a payment_id: the existing shape check
  // only ever allows one for recorded/linked.
  assert.match(CHANGING, /add constraint bank_deposit_links_classified_chk/);
});

test('one deposit is one payment, enforced by a partial unique index', () => {
  assert.match(CHANGING, /create unique index if not exists bank_deposit_links_payment_of_deposit_uidx/);
  assert.match(
    CHANGING,
    /on public\.bank_deposit_links \(deposit_id\) where kind in \('recorded', 'linked'\)/,
  );
  // The old "many payments per deposit, sum must not exceed" rule is gone.
  assert.doesNotMatch(CHANGING, /v_linked/);
  assert.doesNotMatch(CHANGING, /Linked payments exceed the deposit/);
});

test('the guards refuse a second decision on either side', () => {
  // The links guard looks at other_income...
  assert.match(CHANGING, /create or replace function public\.guard_bank_deposit_link\(\)/);
  assert.match(CHANGING, /select 1 from public\.other_income o/);
  // ...and other_income looks back at the links.
  assert.match(CHANGING, /create or replace function public\.guard_other_income_deposit\(\)/);
  assert.match(CHANGING, /select 1 from public\.bank_deposit_links l/);
  // Both lock the deposit so concurrent writes serialize.
  assert.equal((CHANGING.match(/for update;/g) ?? []).length, 2);
  // Both are definer functions with a pinned search_path and no client EXECUTE.
  assert.equal((CHANGING.match(/security definer/g) ?? []).length, 2);
  assert.equal((CHANGING.match(/set search_path = ''/g) ?? []).length, 2);
  assert.match(CHANGING, /revoke execute on function public\.guard_other_income_deposit\(\)/);
});

test('the refusals that stay stay: payment bigger than the deposit, manual only, no payout', () => {
  assert.match(CHANGING, /if v_payment\.amount > v_deposit\.amount then/);
  assert.match(CHANGING, /raise exception 'Payment is bigger than the deposit'/);
  assert.match(CHANGING, /raise exception 'Only a manual payment can be linked to a deposit'/);
  assert.match(CHANGING, /raise exception 'A Stripe payout is never new income'/);
  assert.match(CHANGING, /raise exception 'This deposit already has a decision'/);
  // Still five Stripe and reversal columns refused.
  const refusals = CHANGING.match(/v_payment\.(?:stripe_\w+|reverses_payment_id) is not null/g) ?? [];
  assert.equal(refusals.length, 5, 'every Stripe and reversal column is refused');
});

// ── The privilege check ────────────────────────────────────────────────────

test('every new table, policy and definer function has a required check row', () => {
  for (const id of ['BD5', 'BD6', 'BD7', 'BD8']) {
    assert.match(PRIVCHECK, new RegExp(`select '${id} `), `${id} SQL`);
    assert.match(RESULT, new RegExp(`'${id}'`), `${id} required`);
  }
  // Each row is gated on the migration that creates what it asserts.
  assert.match(PRIVCHECK, /version = '20261103000001'/);
  assert.match(PRIVCHECK, /version = '20261103000002'/);
  // The terminal index check can no longer look for the retired kind.
  assert.doesNotMatch(PRIVCHECK, /indexdef ilike '%not_income%'/);
});
