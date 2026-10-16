import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeForAI, sanitizeField } from './sanitize';

test('sanitizeForAI sanitizes user text for LLM prompts', () => {
  assert.equal(sanitizeForAI('Hello <world>'), 'Hello ‹world›');
  assert.equal(sanitizeForAI('Test\u0000String'), 'Test String');
});

test('sanitizeField strips angle brackets and control characters', () => {
  assert.equal(sanitizeField('Hello <script>'), 'Hello script');
  assert.equal(sanitizeField('User\u0000Name'), 'User Name');
  assert.equal(sanitizeField('  <John\u0007Doe>  '), 'John Doe');
  assert.equal(sanitizeField(123), '');
  assert.equal(sanitizeField(null), '');
});
