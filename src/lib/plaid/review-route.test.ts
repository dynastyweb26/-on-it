// ═══ POST /api/plaid/review — the guarantees a green run cannot show ═══
// Structural, because the handler needs a Next request, a session and Supabase.
// Plain substring checks (no regex), so the assertions stay readable and match
// the route's actual statements.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const POST = readFileSync(
  join(process.cwd(), 'src', 'app', 'api', 'plaid', 'review', 'route.ts'),
  'utf8',
);

const count = (needle: string): number => POST.split(needle).length - 1;

test('gates, authenticates, then validates the body', () => {
  const gate = POST.indexOf("fail('review', 'route_disabled')");
  const auth = POST.indexOf("fail('review', 'unauthorized')");
  const body = POST.indexOf('Body.safeParse');
  assert.ok(gate > 0 && auth > gate && body > auth, 'gate → session → body, in that order');
  assert.equal(count("fail('review', 'unauthorized')"), 1);
  assert.ok(POST.includes("action: z.enum(['add', 'already', 'ignore', 'restore'])"));
});

test('every read and write is scoped to the caller', () => {
  // The row read, the updates and the expense reads: all owner-scoped.
  assert.ok(count(".eq('user_id', user.id)") >= 5);
  assert.ok(POST.includes(".eq('id', transactionId)\n    .eq('user_id', user.id)"), 'the row read');
  assert.ok(POST.includes(".eq('id', row.id)\n      .eq('user_id', user.id)"), 'the updates');
});

test('add is idempotent and writes the bank-verified tag server-side', () => {
  assert.ok(POST.includes("plaid_transaction_id: row.plaid_transaction_id"), 'the tag comes from the row, not the body');
  assert.ok(POST.includes("if (insertError?.code === '23505')"), 'a duplicate adopts the expense it already made');
  assert.ok(POST.includes('centsToAmount(cents)'), 'the amount is written from integer cents');
  assert.ok(!POST.includes('amount * 100'), 'no float money math');
  assert.ok(POST.includes('.max(MAX_EXPENSE_CENTS)'), 'a sanity cap on the editable amount');
});

test('a failed link never leaves an orphan expense', () => {
  const update = POST.indexOf('review_state: decision.next');
  const compensate = POST.indexOf("await admin.from('expenses').delete()");
  assert.ok(update > 0 && compensate > update, 'the delete follows the failed update');
});

test('already requires the caller’s unlinked expense; a missing one is 404', () => {
  assert.ok(POST.includes("if (!match) return fail('review', 'not_found')"));
  assert.ok(POST.includes(".is('deleted_at', null)"));
  assert.ok(POST.includes('suggestMatch('));
});

test('an action the row cannot take is a 409, decided before any write', () => {
  assert.ok(POST.includes('transition({'), 'the state machine decides');
  assert.ok(POST.includes("decision.kind === 'replay'"), 'the replay short-circuits');
  assert.ok(POST.includes("decision.kind === 'bad_state'"), 'the 409 is raised');
  assert.ok(POST.includes("fail('review', 'bad_state')"), 'via fail(), one log line');
  const gate = POST.indexOf("fail('review', 'bad_state')");
  const insert = POST.indexOf(".from('expenses')");
  assert.ok(gate > 0 && insert > gate, 'the 409 comes before the insert');
  assert.ok(POST.includes('bank_state, removed_at'), 'the row read carries the bank state');
});

test('every non-2xx is one fail() line: no other logger', () => {
  assert.ok(!POST.includes('console.error'), 'fail() is the only logger');
  assert.ok(!POST.includes('console.log'));
  assert.ok(!POST.includes('status: 4') && !POST.includes('status: 5'), 'no hand-written error status');
});

test('a receipt enters as a hash only, and is verified before the insert', () => {
  // The path is built from the caller, so a client-sent path has nowhere to go.
  assert.ok(POST.includes('receipt_hash: z.string().optional()'), 'only a hash is accepted');
  assert.ok(!POST.includes('receipt_url: parsed'), 'no receipt path from the body');
  assert.ok(POST.includes('receiptObjectPath(user.id, hash)'), 'the path is rebuilt from the session');
  assert.ok(POST.includes("fail('review', 'receipt_invalid')"), 'a malformed hash is a 422');

  // Order: duplicate pre-check → download → verify → insert.
  const duplicate = POST.indexOf("eq('receipt_hash', hash)");
  const download = POST.indexOf('.download(path)');
  const verify = POST.indexOf('verifyReceipt(bytes, hash)');
  const insert = POST.indexOf('.insert({');
  assert.ok(duplicate > 0 && download > duplicate && verify > download, 'check, fetch, then verify');
  assert.ok(insert > verify, 'nothing is inserted until the receipt verifies');

  // Both receipt columns are written together, from server values.
  assert.ok(POST.includes('receipt_url: receiptPath'));
  assert.ok(POST.includes('receipt_hash: receiptHash'));

  // A content-hash object can be shared, so this route never removes one.
  assert.ok(!POST.includes('.remove('), 'the route never deletes a storage object');
});

test('the stored bytes are never re-hashed against the claimed hash', () => {
  // lib/receipt.ts hashes the ORIGINAL file; the stored object is the re-encoded
  // JPEG, so an equality check here refused every real receipt (422
  // receipt_mismatch). This fails if that check is ever reintroduced.
  assert.ok(!POST.includes('receipt_mismatch'), 'the mismatch refusal is gone');
  assert.ok(!POST.includes('sha256'), 'no digest is computed over the stored bytes');
  assert.ok(POST.includes('verifyReceipt(bytes, hash)'), 'existence, size and the JPEG sniff still run');
  assert.ok(!POST.includes('createHash'), 'the route computes no hash itself');
});

test('a receipt clash is told apart from a replay by constraint name', () => {
  assert.ok(POST.includes('uniqueViolation(insertError)'), 'the index name decides');
  const clash = POST.indexOf("uniqueViolation(insertError) === 'receipt_hash'");
  const adopt = POST.indexOf("if (insertError?.code === '23505')");
  assert.ok(clash > adopt, 'the receipt 409 sits inside the 23505 branch, before the adopt');
  assert.ok(POST.includes("fail('review', 'receipt_duplicate')"), 'a duplicate receipt is a 409');
});
