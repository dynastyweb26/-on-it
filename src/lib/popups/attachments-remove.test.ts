// Board 1 · D8 (P-11, P-12): the remove confirm's words, pinned.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ATTACHMENT_REMOVE_CONSEQUENCE,
  attachmentRemoveLabel,
  attachmentRemoveTitle,
} from './destructive';

test('D8: the confirm names what is being removed', () => {
  assert.equal(attachmentRemoveTitle(true), 'Remove this photo?');
  assert.equal(attachmentRemoveLabel(true), 'Remove photo');
  assert.equal(attachmentRemoveTitle(false), 'Remove this file?');
  assert.equal(attachmentRemoveLabel(false), 'Remove file');
});

test('D8: a failed removal never claims the file went', () => {
  assert.equal(ATTACHMENT_REMOVE_CONSEQUENCE, 'Couldn’t remove that file.');
});
