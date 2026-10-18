import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeField, sanitizeForAI } from './sanitize';

test('sanitizeField handles non-string and empty inputs', () => {
  assert.equal(sanitizeField(null), '');
  assert.equal(sanitizeField(undefined), '');
  assert.equal(sanitizeField(123), '');
  assert.equal(sanitizeField({}), '');
  assert.equal(sanitizeField(''), '');
  assert.equal(sanitizeField('   '), '');
});

test('sanitizeField strips angle brackets and ASCII control characters', () => {
  assert.equal(sanitizeField('<script>alert("xss")</script>'), 'scriptalert("xss")/script');
  assert.equal(sanitizeField('Hello\0World'), 'HelloWorld');
  assert.equal(sanitizeField('Line1\r\nLine2\tEnd'), 'Line1Line2End');
  assert.equal(sanitizeField('Clean\x7FField'), 'CleanField');
});

test('sanitizeField caps max length and trims whitespace', () => {
  assert.equal(sanitizeField('  abcdefghij  ', 5), 'abcde');
  assert.equal(sanitizeField('  <hello> world  ', 300), 'hello world');
});

test('sanitizeForAI converts angle brackets and strips format/control characters', () => {
  assert.equal(sanitizeForAI('<user_input>hello</user_input>'), '‹user_input›hello‹/user_input›');
  assert.equal(sanitizeForAI('test\u200Bzero\u200Cwidth'), 'testzerowidth');
});
