import { test } from 'node:test';
import assert from 'node:assert/strict';
import { versionChipLabel } from './versions';

test('the version badge is hidden at v1', () => {
  assert.equal(versionChipLabel(1), null);
  assert.equal(versionChipLabel(0), null);
  assert.equal(versionChipLabel(null), null);
  assert.equal(versionChipLabel(undefined), null);
  assert.equal(versionChipLabel(1.5), null);
});

test('the version badge shows the current version from v2 on', () => {
  assert.equal(versionChipLabel(2), 'v2');
  assert.equal(versionChipLabel(12), 'v12');
});
