import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeField, sanitizeForAI } from './sanitize';

test('sanitizeField handles non-string inputs', () => {
  assert.equal(sanitizeField(null), '');
  assert.equal(sanitizeField(undefined), '');
  assert.equal(sanitizeField(123), '');
  assert.equal(sanitizeField({ key: 'value' }), '');
});

test('sanitizeField strips standard angle brackets and trims', () => {
  assert.equal(sanitizeField('<script>alert(1)</script>'), 'scriptalert(1)/script');
  assert.equal(sanitizeField('  Hello <World>  '), 'Hello World');
});

test('sanitizeField folds and strips unicode look-alike angle brackets', () => {
  // Fullwidth angle brackets ＜ ＞ (\uFF1C, \uFF1E)
  assert.equal(sanitizeField('＜script＞alert(1)＜/script＞'), 'scriptalert(1)/script');
  // Small form variants ﹤ ﹥ (\uFE64, \uFE65)
  assert.equal(sanitizeField('﹤script﹥alert(1)﹤/script﹥'), 'scriptalert(1)/script');
});

test('sanitizeField removes invisible format control characters and handles ASCII control chars', () => {
  // Zero-width space (\u200B) inside tag
  assert.equal(sanitizeField('<\u200Bscript>alert(1)</script>'), 'scriptalert(1)/script');
  // Null byte (\u0000) and newlines
  assert.equal(sanitizeField('Hello\u0000World\nTest'), 'Hello World Test');
});

test('sanitizeField respects maxLen parameter', () => {
  const longInput = 'A'.repeat(500);
  assert.equal(sanitizeField(longInput, 50).length, 50);
  assert.equal(sanitizeField('   short input   ', 10), 'short inpu');
});

test('sanitizeForAI sanitizes user input for AI prompts', () => {
  assert.equal(sanitizeForAI('<script>alert("test")</script>'), '‹script›alert("test")‹/script›');
  assert.equal(sanitizeForAI('＜script＞alert(1)＜/script＞'), '‹script›alert(1)‹/script›');
});
