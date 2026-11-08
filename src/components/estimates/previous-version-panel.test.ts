// The previous version is a read-only view. This guard reads the panel source
// because the app's unit tests run without a DOM; the values it draws come from
// snapshotView(), whose shape is covered in lib/estimates/versions.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const panel = readFileSync('src/components/estimates/PreviousVersionPanel.tsx', 'utf8');

test('the previous-version panel never renders writable controls', () => {
  assert.doesNotMatch(panel, /<input|<textarea|<select/);
  assert.doesNotMatch(panel, /contentEditable/i);
  assert.doesNotMatch(panel, /onChange|onInput|onSave|onBlur|onSubmit/);
  // The only button is the way back to the current version.
  assert.equal(panel.match(/<button/g)?.length, 1);
  assert.match(panel, /\{view\.backLabel\}/);
});
