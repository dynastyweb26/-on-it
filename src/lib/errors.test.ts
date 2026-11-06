// The shared classifier is the only thing allowed to name a cause, so every
// class it can return is pinned here — a new class with no test would let a
// 429 read as "something broke on our end".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyError, userMessage, ERROR_MESSAGE, type ErrorKind } from '@/lib/errors';

const KINDS: ErrorKind[] = [
  'offline', 'signed_out', 'rate_limit', 'too_large', 'unsupported',
  'duplicate', 'bad_input', 'not_found', 'our_end',
];

test('every class the classifier can return has copy of its own', () => {
  const sentences = KINDS.map((k) => ERROR_MESSAGE[k]);
  assert.equal(sentences.every((s) => typeof s === 'string' && s.length > 0), true);
  assert.equal(new Set(sentences).size, KINDS.length, 'two classes share a sentence');
  for (const s of sentences) assert.equal(/quote/i.test(s), false);
});

test('signed out is its own cause, not a connection problem', () => {
  assert.equal(classifyError({ status: 401 }), 'signed_out');
  assert.equal(classifyError({ code: 'PGRST301' }), 'signed_out');
  assert.equal(classifyError({ message: 'JWT expired' }), 'signed_out');
  assert.equal(userMessage({ status: 401 }), ERROR_MESSAGE.signed_out);
});

test('429 and a spent daily cap read as rate limited', () => {
  assert.equal(classifyError({ status: 429 }), 'rate_limit');
  assert.equal(classifyError({ status: '429' }), 'rate_limit');
  assert.equal(classifyError({ message: "That's today's voice limit — it resets tomorrow." }), 'rate_limit');
  assert.equal(classifyError({ message: 'rate limited' }), 'rate_limit');
  assert.equal(userMessage({ status: 429 }), ERROR_MESSAGE.rate_limit);
  assert.notEqual(userMessage({ status: 429 }), ERROR_MESSAGE.our_end);
});

test('413 reads as too large, 415 as an unreadable type', () => {
  assert.equal(classifyError({ status: 413 }), 'too_large');
  assert.equal(classifyError({ status: 413, message: 'too large' }), 'too_large');
  assert.equal(classifyError({ status: 415 }), 'unsupported');
  assert.equal(classifyError({ status: 415, message: 'bad type' }), 'unsupported');
  assert.equal(userMessage({ status: 413 }), ERROR_MESSAGE.too_large);
  assert.equal(userMessage({ status: 415 }), ERROR_MESSAGE.unsupported);
});

test('a unique-name collision is a duplicate, other constraint errors are not', () => {
  assert.equal(classifyError({ code: '23505' }), 'duplicate');
  assert.equal(classifyError({ code: '23505', message: 'duplicate key value violates unique constraint' }), 'duplicate');
  assert.equal(userMessage({ code: '23505' }), ERROR_MESSAGE.duplicate);
  // Still bad input: a check constraint or a missing parent row is a field problem.
  assert.equal(classifyError({ code: '23514' }), 'bad_input');
  assert.equal(classifyError({ code: '23503' }), 'bad_input');
  assert.equal(classifyError({ status: 400 }), 'bad_input');
});

test('offline, not found, and our end keep their own classes', () => {
  assert.equal(classifyError({ name: 'NetworkError', message: 'Failed to fetch' }), 'offline');
  assert.equal(classifyError({ status: 404 }), 'not_found');
  assert.equal(classifyError({ status: 500 }), 'our_end');
  assert.equal(classifyError({ status: 503, message: 'boom' }), 'our_end');
});

test('a constraint or schema fault is ours, never the user\'s field', () => {
  const onConflict = {
    status: 400,
    code: '42P10',
    message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification',
  };
  assert.equal(classifyError(onConflict), 'our_end');
  assert.equal(userMessage(onConflict), ERROR_MESSAGE.our_end);
  // The same fault with no SQL code still names the real cause.
  assert.equal(
    classifyError({ status: 400, message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification' }),
    'our_end',
  );
  assert.equal(classifyError({ status: 400, code: '42703', message: 'column invoice_payments.foo does not exist' }), 'our_end');
  assert.equal(classifyError({ status: 400, code: 'PGRST204', message: "Could not find the 'foo' column of 'invoice_payments'" }), 'our_end');
  // Everything else keeps its own mapping.
  assert.equal(classifyError({ status: 400 }), 'bad_input');
  assert.equal(classifyError({ code: '23514' }), 'bad_input');
  assert.equal(classifyError({ code: '23505' }), 'duplicate');
});

test('no cause is ever reported as offline by accident', () => {
  for (const err of [{ status: 401 }, { status: 429 }, { status: 413 }, { status: 415 }, { code: '23505' }, { status: 500 }]) {
    assert.notEqual(classifyError(err), 'offline');
  }
});
