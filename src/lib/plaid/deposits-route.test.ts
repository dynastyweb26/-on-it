// The deposits route's contract, checked on its source so a later edit cannot
// quietly move the payout refusal below the write or accept a client amount.
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
  assert.equal((SOURCE.match(/eq\('user_id', user\.id\)/g) ?? []).length >= 8, true);
});

test('a payout is refused before any ledger write can happen', () => {
  const refusal = POST.indexOf('const refusal = depositLinkRefusal(deposit)');
  const ledgerInsert = POST.indexOf("from('invoice_payments')");
  assert.ok(refusal > 0, 'the refusal exists');
  assert.ok(ledgerInsert > refusal, 'the refusal is above the first ledger query');
  assert.match(POST, /refusal === 'stripe_payout'\) return fail\('deposits', 'payout_not_income'\)/);
  assert.match(POST, /refusal === 'removed'\) return fail\('deposits', 'bad_state'\)/);
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
