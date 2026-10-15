import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeField, sanitizeForAI } from './sanitize';

test('sanitizeField strips angle brackets, control characters, and caps length', () => {
  assert.equal(sanitizeField('<script>hello\u0000world</script>', 100), 'scripthello world/script');
  assert.equal(sanitizeField('valid\u0007input', 120), 'valid input');
  assert.equal(sanitizeField(null), '');
  assert.equal(sanitizeField(123), '');
  assert.equal(sanitizeField('  test  ', 10), 'test');
});

test('sanitizeForAI strips tags and control characters', () => {
  assert.equal(sanitizeForAI('<user_input>test\u0000</user_input>'), '‹user_input›test ‹/user_input›');
});
