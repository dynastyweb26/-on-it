import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_CLIENT_EMAIL_CHARS, normalizeClientEmail } from './client-contact';

test('a usable address is kept, trimmed', () => {
  assert.equal(normalizeClientEmail('  deffeu@gmail.com '), 'deffeu@gmail.com');
  assert.equal(normalizeClientEmail('brandon.smith+invoices@sub.example.co'), 'brandon.smith+invoices@sub.example.co');
});

test('dictated spacing around @ and dots is removed, not rejected', () => {
  assert.equal(normalizeClientEmail('deffeu @ gmail.com'), 'deffeu@gmail.com');
  assert.equal(normalizeClientEmail('deffeu@gmail . com'), 'deffeu@gmail.com');
});

test('anything unusable is null, never an error', () => {
  for (const bad of [null, undefined, '', '   ', 'deffeu', 'deffeu@', '@gmail.com', 'deffeu@gmail', 'deffeu@@gmail.com', 'a b@c.com', 42]) {
    assert.equal(normalizeClientEmail(bad as unknown), null, `expected null for ${String(bad)}`);
  }
});

test('angle brackets are stripped before validation (prompt-injection layer)', () => {
  assert.equal(normalizeClientEmail('<x@y.com>'), 'x@y.com');
});

test('an address over the column cap is null', () => {
  const long = `${'a'.repeat(MAX_CLIENT_EMAIL_CHARS)}@example.com`;
  assert.ok(long.length > MAX_CLIENT_EMAIL_CHARS);
  assert.equal(normalizeClientEmail(long), null);
});
