import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientNameKey } from './client-name';

test('clientNameKey matches lower(btrim(name))', () => {
  assert.equal(clientNameKey('Bob Welding'), 'bob welding');
  assert.equal(clientNameKey('  CYRIL  '), 'cyril');
  assert.equal(clientNameKey('Ann  Lee'), 'ann  lee');      // inner spaces kept
  assert.equal(clientNameKey('\tTab'), '\ttab');            // btrim strips spaces only
});

test('clientNameKey treats LIKE wildcards as plain text', () => {
  assert.equal(clientNameKey('100% Roofing'), '100% roofing');
  assert.equal(clientNameKey('A_B'), 'a_b');
});
