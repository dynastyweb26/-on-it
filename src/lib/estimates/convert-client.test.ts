import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertErrorReason, convertKey } from './convert-client';

test('the paywall hint and a duplicate key are told apart from a real failure', () => {
  assert.equal(convertErrorReason({ hint: 'PAYWALL_LIMIT' }), 'paywall');
  assert.equal(convertErrorReason({ code: '23505' }), 'duplicate');
  assert.equal(convertErrorReason({ code: '500' }), 'error');
  assert.equal(convertErrorReason(null), 'error');
});

test('the idempotency key is the same one the estimate screen uses', () => {
  assert.equal(convertKey('abc'), 'convert-abc');
});
