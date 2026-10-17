import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeField, sanitizeForAI } from './sanitize';

test('sanitizeField handles non-string inputs', () => {
  assert.equal(sanitizeField(null), '');
  assert.equal(sanitizeField(undefined), '');
  assert.equal(sanitizeField(123), '');
  assert.equal(sanitizeField({}), '');
});

test('sanitizeField strips angle brackets', () => {
  assert.equal(sanitizeField('hello <script>alert(1)</script> world'), 'hello scriptalert(1)/script world');
  assert.equal(sanitizeField('<<>>'), '');
});

test('sanitizeField strips control characters including null bytes', () => {
  assert.equal(sanitizeField('hello\0world'), 'helloworld');
  assert.equal(sanitizeField('user\u0000name'), 'username');
  assert.equal(sanitizeField('line1\u0007line2'), 'line1line2');
  assert.equal(sanitizeField('text\u001B[31mred'), 'text[31mred');
});

test('sanitizeField respects max length and trims whitespace', () => {
  assert.equal(sanitizeField('   hello world   '), 'hello world');
  assert.equal(sanitizeField('1234567890', 5), '12345');
});

test('sanitizeForAI sanitizes user input for AI prompts', () => {
  assert.equal(sanitizeForAI('<user_input>test</user_input>'), '‹user_input›test‹/user_input›');
  assert.equal(sanitizeForAI('hello\0world'), 'hello world');
});
