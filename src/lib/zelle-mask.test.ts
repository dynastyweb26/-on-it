import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zelleLast4, zelleMask, zelleMaskFromProfile } from './zelle-mask';

test('mask: last 4 characters of a phone or email', () => {
  assert.equal(zelleMask('555-0142'), '••••0142');
  assert.equal(zelleMask('cyril@example.com'), '••••.com');
});

test('mask: 4 characters or fewer shows plain dots, never the value', () => {
  assert.equal(zelleMask('1234'), '••••');
  assert.equal(zelleMask('ab'), '••••');
  assert.equal(zelleLast4('1234'), '');
  assert.equal(zelleLast4('12345'), '2345');
});

test('profile: a stored last4 renders with no fetch, and matches the server mask', () => {
  for (const v of ['555-0142', 'cyril@example.com', '1234']) {
    assert.equal(zelleMaskFromProfile({ zelle_last4: zelleLast4(v), zelle_info_enc: '\\x01' }), zelleMask(v));
  }
});

test('profile: nothing stored → null (Not set), no fetch', () => {
  assert.equal(zelleMaskFromProfile({ zelle_last4: null, zelle_info_enc: null }), null);
  assert.equal(zelleMaskFromProfile({}), null);
});

test('profile: encrypted value but no last4 yet (pre-migration user) → undefined, so Settings fetches', () => {
  assert.equal(zelleMaskFromProfile({ zelle_last4: null, zelle_info_enc: '\\x01' }), undefined);
});

test('profile: an empty last4 is "stored, short", not "unset"', () => {
  assert.equal(zelleMaskFromProfile({ zelle_last4: '', zelle_info_enc: '\\x01' }), '••••');
});
