import { test } from 'node:test';
import assert from 'node:assert/strict';
import { badgeVersion, changeCount, changeLabel, editingLine, sameLinkNote, savedLine } from './edit-view';

const a = { description: 'Therapy Sessions', qty: 1, unit_price: 50 };

test('counts a changed, an added and a removed line, plus the title', () => {
  assert.equal(changeCount([a], [a], false), 0);
  assert.equal(changeCount([a], [{ ...a, qty: 2 }], false), 1);
  assert.equal(changeCount([a], [a, a], false), 1);
  assert.equal(changeCount([a, a], [a], false), 1);
  assert.equal(changeCount([a], [{ ...a, qty: 2 }], true), 2);
  assert.equal(changeLabel(1), '1 change');
  assert.equal(changeLabel(3), '3 changes');
});

test('a draft has no badge; unsaved edits show the version they will become', () => {
  assert.equal(badgeVersion(false, 1, false), null);
  assert.equal(badgeVersion(true, 1, false), 1);
  assert.equal(badgeVersion(true, 1, true), 2);
  assert.equal(badgeVersion(true, 2, false), 2);
  assert.equal(badgeVersion(true, NaN, false), 1);
});

test('the editing line names both versions', () => {
  assert.equal(editingLine(1, true, 'Nov 7'), 'Editing v2 · v1 sent Nov 7');
  assert.equal(editingLine(1, false, 'Nov 7'), null);
  assert.equal(editingLine(1, true, null), 'Editing v2');
});

test('the notes use the name and no pronoun for the client', () => {
  const n = sameLinkNote('Maryam');
  assert.equal(n.lead, 'Same link, updated.');
  assert.ok(!/\b(she|he|her|him|his)\b/i.test(n.rest));
  assert.equal(savedLine(2, 'Maryam'), 'Saved as v2. Same link. Want me to let Maryam know?');
});
