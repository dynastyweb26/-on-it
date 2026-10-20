import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeField, sanitizeForAI } from './sanitize';

test('sanitizeField handles non-string inputs', () => {
  assert.equal(sanitizeField(null), '');
  assert.equal(sanitizeField(undefined), '');
  assert.equal(sanitizeField(123), '');
  assert.equal(sanitizeField({}), '');
});

test('sanitizeField strips angle brackets and normalizes fullwidth look-alikes', () => {
  assert.equal(sanitizeField('hello <world>'), 'hello world');
  // Fullwidth angle brackets NFKC normalize to < and > then get stripped
  assert.equal(sanitizeField('hello ＜world＞'), 'hello world');
});

test('sanitizeField strips format control characters', () => {
  // Zero-width space (\u200B) and BOM (\uFEFF)
  assert.equal(sanitizeField('hello\u200Bworld\uFEFF'), 'helloworld');
});

test('sanitizeField replaces ASCII control characters with spaces', () => {
  assert.equal(sanitizeField('hello\x00world\x07test'), 'hello world test');
});

test('sanitizeField enforces max length and trims', () => {
  assert.equal(sanitizeField('  hello world  ', 5), 'hello');
});

test('sanitizeForAI sanitizes text for AI prompt injection defense', () => {
  assert.equal(sanitizeForAI('<user_input>test</user_input>'), '‹user_input›test‹/user_input›');
});
