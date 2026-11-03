// The deposits route's contract, checked on its source so a later edit cannot
// quietly move the payout refusal below the write, accept a client amount, let
// one deposit collect two decisions, or write a 'sure' payout nobody verified.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(
  join(process.cwd(), 'src', 'app', 'api', 'plaid', 'deposits', 'route.ts'),
  'utf8',
);

/** The write path only: the GET already reads invoice_payments to list them. */
const POST = SOURCE.slice(SOURCE.indexOf('export async function POST'));

test('the route is preview-gated first and scoped to the session user', () => {
  assert.match(SOURCE, /plaidRouteEnabled\(process\.env\.VERCEL_ENV\)/);
  assert.match(SOURCE, /if \(!user\) return fail\('deposits', 'unauthorized'\)/);
  // Every deposit read and write carries the caller's id.
  assert.ok((SOURCE.match(/eq\('user_id', user\.id\)/g) ?? []).length >= 8);
});

test('the action set is the new one: no "not_income" anywhere', () => {
  assert.match(SOURCE, /action: z\.enum\(\['record', 'already', 'ignored', 'classified'\]\)/);
  assert.doesNotMatch(SOURCE, /'not_income'/);
});

test('the payout verdict is derived on the server from descriptors alone', () => {
  assert.match(POST, /stripePayoutVerdict\(\{/);
  assert.doesNotMatch(POST, /parsed\.data\.(payout|verdict|is_stripe_payout)/);
  // No amount comparison: there is no payout record to compare against.
  assert.doesNotMatch(SOURCE, /unclaimedCardCents|knownPayout|balance_transaction/);
});

test('a STRIPE deposit is refused before any ledger write can happen', () => {
  const refusal = POST.indexOf('const refusal = depositLinkRefusal(deposit, verdict, action)');
  const ledgerWrite = POST.indexOf('.insert(row)');
  assert.ok(refusal > 0, 'the refusal exists');
  assert.ok(ledgerWrite > refusal, 'the refusal is above the ledger insert');
  assert.match(POST, /refusal === 'stripe_payout'\) return fail\('deposits', 'payout_not_income'\)/);
  assert.match(POST, /refusal === 'removed'\) return fail\('deposits', 'bad_state'\)/);
});

test('one deposit takes one decision, checked before either table is written', () => {
  assert.match(POST, /if \(links\.length > 0 \|\| hasIncome\) return fail\('deposits', 'deposit_already_decided'\)/);
  const linksRead = POST.indexOf(".select('kind, payment_id, classification')");
  const incomeRead = POST.indexOf(".from('other_income')");
  const firstWrite = POST.indexOf('.insert(');
  assert.ok(linksRead > 0 && linksRead < firstWrite, 'links read before any insert');
  assert.ok(incomeRead > 0 && incomeRead < firstWrite, 'income read before any insert');
});

test('the ledger row is the deterministic bank/manual row, keyed by the deposit', () => {
  assert.match(POST, /depositPaymentRow\(/);
  assert.match(POST, /depositPaymentKey\(deposit\.id\)/);
  // The client never sends an amount: the row is built from the deposit's.
  assert.match(POST, /amountCents: depositCents/);
  assert.doesNotMatch(POST, /parsed\.data\.(amount|amount_cents)/);
});

test('a duplicate idempotency key adopts the row instead of writing a second one', () => {
  const keyRead = POST.indexOf("eq('idempotency_key', key)");
  const insert = POST.indexOf('.insert(row)');
  assert.ok(keyRead > 0 && keyRead < insert, 'reads by key before inserting');
  assert.match(POST, /insertError\.code === '23505'/);
  assert.match(POST, /paymentId = \(replay as \{ id\?: string \} \| null\)\?\.id \?\? null/);
});

test('every ledger delete is the keyed compensation for a refused link', () => {
  const deletes = SOURCE.match(/\.delete\(\)/g) ?? [];
  assert.equal(deletes.length, 2, 'only the two compensation paths delete');
  const keyed = SOURCE.match(/eq\('idempotency_key', key\)/g) ?? [];
  assert.ok(keyed.length >= 2, 'each delete is scoped to this deposit key');
  // No path edits a ledger row (a removal must never rewrite one).
  assert.doesNotMatch(SOURCE, /from\('invoice_payments'\)[\s\S]{0,80}\.update\(/);
});

test('a Stripe-written ledger row is never claimable as a deposit', () => {
  assert.match(SOURCE, /stripe_checkout_session_id \|\| payment\.stripe_event_id/);
  assert.match(SOURCE, /return fail\('deposits', 'bad_state'\)/);
});

test('classifying writes an other_income row for income and a link for the rest', () => {
  assert.match(POST, /otherIncomeFromDeposit\(\{/);
  assert.match(POST, /kind: 'classified'/);
  // A STRIPE descriptor is never income, whichever of the six is picked.
  assert.match(POST, /if \(counts && verdict !== 'not_stripe'\) return fail\('deposits', 'payout_not_income'\)/);
  assert.match(SOURCE, /countsAsIncome, incomeClassification, isClassification, otherIncomeFromDeposit/);
});

test('"Don\'t add" stores ignored, and stripe_payout is never written by code', () => {
  assert.match(POST, /kind: 'ignored'/);
  // Kept in the kind check for a future verified match; no write path here.
  assert.doesNotMatch(SOURCE, /kind: 'stripe_payout'/);
  assert.doesNotMatch(SOURCE, /ignoredKind/);
});

test('a deposit decided as income no longer shows up in To review', () => {
  assert.match(SOURCE, /incomeDepositIds/);
  assert.match(SOURCE, /\.filter\(\(row\) => !row\.accounted \|\| row\.removed\)/);
  assert.match(SOURCE, /accounted: links\.length > 0 \|\| incomeDepositIds\.has\(row\.id\)/);
});
