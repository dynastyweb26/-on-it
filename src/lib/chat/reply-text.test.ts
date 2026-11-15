import test from 'node:test';
import assert from 'node:assert/strict';
import { bubbleTextFor } from './reply-text';
import { NO_LOOKUP_REPLY, UNSUPPORTED_REPLY } from '@/lib/tools/reply';

test('a cant.do card does not get its own sentence repeated above it', () => {
  assert.equal(bubbleTextFor(UNSUPPORTED_REPLY, 'cant.do'), 'I can tell you who hasn\'t paid you.');
  assert.equal(bubbleTextFor(NO_LOOKUP_REPLY, 'cant.do'), '');
});

test('any other card, or no card, keeps the reply as composed', () => {
  assert.equal(bubbleTextFor('Two are unpaid.', 'list.ranked'), 'Two are unpaid.');
  assert.equal(bubbleTextFor(NO_LOOKUP_REPLY, null), NO_LOOKUP_REPLY);
  assert.equal(bubbleTextFor('Ready to confirm.', 'confirm.batch'), 'Ready to confirm.');
});

test('a reply that never carried the line is left alone', () => {
  assert.equal(bubbleTextFor('Here is what I found.', 'cant.do'), 'Here is what I found.');
});
