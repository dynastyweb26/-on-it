// ═══ POST /api/plaid/review — the guarantees a green run cannot show ═══
// Structural, because the handler needs a Next request, a session and Supabase.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const POST = readFileSync(
  join(process.cwd(), 'src', 'app', 'api', 'plaid', 'review', 'route.ts'),
  'utf8',
);

test('gates, authenticates, then validates the body', () => {
  const gate = POST.indexOf("fail('review', 'route_disabled')");
  const auth = POST.indexOf("fail('review', 'unauthorized')");
  const body = POST.indexOf('Body.safeParse');
  assert.ok(gate > 0 && auth > gate && body > auth, 'gate → session → body, in that order');
  assert.equal((POST.match(/fail\('review', 'unauthorized'\)/g) ?? []).length, 1);
  assert.match(POST, /action: z\.enum\(\['add', 'already', 'ignore', 'restore'\]\)/);
});

test('every read and write is scoped to the caller', () => {
  // The row read, the two updates and the expense reads: all owner-scoped.
  assert.ok((POST.match(/\.eq\('user_id', user\.id\)/g) ?? []).length >= 5);
  assert.match(POST, /\.eq\('id', transactionId\)\s*\n\s*\.eq\('user_id', user\.id\)/, 'the row read');
  assert.match(POST, /\.eq\('id', row\.id\)\s*\n\s*\.eq\('user_id', user\.id\)/, 'the updates');
});

test('add is idempotent and writes the bank-verified tag server-side', () => {
  assert.match(POST, /if \(DECIDED\.has\(row\.review_state\) && row\.expense_id && action === 'add'\)/, 'a second add short-circuits');
  assert.match(POST, /plaid_transaction_id: row\.plaid_transaction_id/, 'the tag comes from the row, not the body');
  assert.match(POST, /if \(insertError\?\.code === '23505'\)/, 'a duplicate adopts the expense it already made');
  assert.match(POST, /centsToAmount\(cents\)/, 'the amount is written from integer cents');
  assert.doesNotMatch(POST, /amount \* 100|\* 100/, 'no float money math');
  assert.match(POST, /\.max\(MAX_EXPENSE_CENTS\)/, 'a sanity cap on the editable amount');
});

test('a failed link never leaves an orphan expense', () => {
  const update = POST.indexOf("review_state: 'added'");
  const compensate = POST.indexOf("await admin.from('expenses').delete()");
  assert.ok(update > 0 && compensate > update, 'the delete follows the failed update');
});

test('already requires the caller’s unlinked expense; a missing one is 404', () => {
  assert.match(POST, /if \(!match\) return fail\('review', 'not_found'\)/);
  assert.match(POST, /\.is\('deleted_at', null\)/);
  assert.match(POST, /suggestMatch\(/);
});

test('every non-2xx is one fail() line: no other logger', () => {
  assert.doesNotMatch(POST, /console\.(error|log|warn)/);
  assert.doesNotMatch(POST, /status:\s*[45]\d\d/);
});
