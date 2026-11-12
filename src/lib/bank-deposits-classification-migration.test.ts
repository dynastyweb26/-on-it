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
// The owner-write model for other_income landed later, for unattached payments.
const UNATTACHED = read('supabase', 'migrations', '20261111120000_unattached_payment.sql');
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

test('other_income started owner-read; its write policies live in the unattached migration', () => {
  assert.match(ADDITIVE, /alter table public\.other_income enable row level security/);
  assert.match(ADDITIVE, /create policy "own other income select"/);
  assert.match(ADDITIVE, /for select using \(auth\.uid\(\) = user_id\)/);
  // This file added no write policy of its own: the deposit route ran on the
  // service role.
  assert.doesNotMatch(ADDITIVE, /create policy[^;]*for (insert|update|delete|all)\b/i);
  assert.match(ADDITIVE, /revoke all on public\.other_income from anon, authenticated/);
  assert.match(ADDITIVE, /grant select on public\.other_income to authenticated/);
  assert.match(ADDITIVE, /grant select, insert, update, delete on public\.other_income to service_role/);
  // The owner-write model is a different migration, and only for manual rows.
  assert.match(UNATTACHED, /create policy "own other income insert"/);
  assert.match(UNATTACHED, /create policy "own other income update"/);
  assert.match(UNATTACHED, /create policy "own other income delete"/);
  assert.match(UNATTACHED, /deposit_id is null/);
});

test('deleting a deposit unlinks the income row instead of deleting it', () => {
  assert.ok(ADDITIVE.includes('references public.bank_deposits(id) on delete set null'),
    'the income row survives: the money still arrived');
  assert.equal(ADDITIVE.includes('references public.bank_deposits(id) on delete cascade'),
    false,
    'a removed bank connection never deletes income');
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

test('the old kind check goes first, then the rows, then the new check', () => {
  const dropped = CHANGING.indexOf(
    'drop constraint if exists bank_deposit_links_kind_check',
  );
  const update = CHANGING.indexOf("set kind = 'ignored'");
  const added = CHANGING.indexOf(
    'add constraint bank_deposit_links_kind_check',
  );
  assert.ok(dropped > 0, 'the old check is dropped');
  // 'ignored' is not in the OLD check, so the backfill is refused if the drop
  // comes after it.
  assert.ok(update > dropped, 'the backfill runs after the old check is gone');
  assert.ok(added > update, 'the new check lands once every row is valid');
  assert.match(CHANGING, /where kind = 'not_income'/);
});

test('classification is required iff the link is classified', () => {
  assert.match(CHANGING, /add column if not exists classification text/);
  // Only the four kinds that count nowhere belong on a link. The two income
  // kinds are a real other_income row, and Collected sums rows, not links.
  const linkCheck = CHANGING.slice(
    CHANGING.indexOf('bank_deposit_links_classification_check'),
    CHANGING.indexOf('bank_deposit_links_classified_chk'),
  );
  assert.ok(
    linkCheck.includes("'vendor_refund', 'transfer', 'loan_or_owner', 'unknown'"),
    'the four non-income kinds',
  );
  assert.equal(
    linkCheck.includes('customer_payment'), false,
    'an income kind is never stored on a link',
  );
  assert.equal(
    linkCheck.includes('other_income'), false,
    'an income kind is never stored on a link',
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

/** The body of one create-or-replace function, up to its closing $$;. */
function guardBody(name: string): string {
  const start = CHANGING.indexOf(`create or replace function public.${name}()`);
  assert.ok(start > 0, `${name} exists`);
  const end = CHANGING.indexOf('$$;', start);
  return CHANGING.slice(start, end);
}

test('a flagged payout refuses a new payment but still takes an existing one', () => {
  const links = guardBody('guard_bank_deposit_link');
  // Only 'recorded' writes a new ledger row, so only it can double-count.
  assert.ok(links.includes("if new.kind = 'recorded' and v_deposit.is_stripe_payout then"),
    'a new payment is refused on a flagged payout');
  // No blanket refusal on the link path: that would refuse the safe answer.
  assert.equal(links.includes('if v_deposit.is_stripe_payout then'), false,
    'the link path has no unconditional payout refusal');
  // The link is still checked as usual: manual only, and no bigger than the
  // deposit. Claiming an existing payment creates no income.
  assert.ok(links.includes("if new.kind in ('recorded', 'linked') then"));
  assert.ok(links.includes('if v_payment.amount > v_deposit.amount then'));
  // other_income is the income side, so its refusal stays unconditional.
  assert.ok(guardBody('guard_other_income_deposit').includes('if v_deposit.is_stripe_payout then'),
    'other_income refuses a payout deposit whatever the kind');
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
