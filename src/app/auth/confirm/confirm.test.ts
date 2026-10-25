import test from 'node:test';
import assert from 'node:assert/strict';
import { safeNext } from './route';

test('safeNext allows valid relative paths', () => {
  assert.equal(safeNext('/chat'), '/chat');
  assert.equal(safeNext('/reset-password'), '/reset-password');
  assert.equal(safeNext('/settings/plan'), '/settings/plan');
});

test('safeNext rejects null, empty or oversized inputs', () => {
  assert.equal(safeNext(null), '/chat');
  assert.equal(safeNext(''), '/chat');
  assert.equal(safeNext('/' + 'a'.repeat(250)), '/chat');
});

test('safeNext rejects open redirect and malformed path vectors', () => {
  assert.equal(safeNext('https://evil.com'), '/chat');
  assert.equal(safeNext('//evil.com'), '/chat');
  assert.equal(safeNext('/\\evil.com'), '/chat');
  assert.equal(safeNext('\\evil.com'), '/chat');
  assert.equal(safeNext('/foo/bar\\baz'), '/chat');
  assert.equal(safeNext('/foo//bar'), '/chat');
  assert.equal(safeNext('javascript:alert(1)'), '/chat');
});
