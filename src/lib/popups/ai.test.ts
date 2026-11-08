import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FALLBACK } from '../tools/reply';
import { UNSUPPORTED_CHIP, failedBubbleTitle, unsupportedReplyExtras, visibleChips } from './ai';

test('A1: the unsupported reply carries the one supported question as a chip', () => {
  const extras = unsupportedReplyExtras();
  assert.deepEqual(extras.chips, ['Who hasn’t paid me?']);
  assert.equal(extras.skipHistory, true);
  assert.equal(UNSUPPORTED_CHIP, 'Who hasn’t paid me?');
});

test('A1: chips show on the latest message only, and lock while a turn runs', () => {
  const msg = { chips: [UNSUPPORTED_CHIP] };
  assert.deepEqual(visibleChips(msg, true, false), [{ label: UNSUPPORTED_CHIP, disabled: false }]);
  assert.deepEqual(visibleChips(msg, true, true), [{ label: UNSUPPORTED_CHIP, disabled: true }]);
  assert.deepEqual(visibleChips(msg, false, false), []);
  assert.deepEqual(visibleChips({}, true, false), []);
});

test('A2: a failed lookup is titled; offline and hiccup keep their own titles', () => {
  assert.equal(failedBubbleTitle(FALLBACK), 'Couldn’t look that up');
  assert.equal(failedBubbleTitle("You're offline — that didn't send."), 'You’re offline');
  assert.equal(failedBubbleTitle("Connection hiccup — that didn't go through."), 'Connection hiccup');
  assert.equal(failedBubbleTitle('Say that again?'), null);
});

// These fail if the chat stops using them: the chip is attached to the real
// unsupported reply, and the failed bubble shows its title.
test('ChatView attaches the chip and the failure title', () => {
  const src = readFileSync(new URL('../../components/tabs/ChatView.tsx', import.meta.url), 'utf8');
  assert.ok(src.includes('aMsg(reply, unsupportedReplyExtras())'));
  assert.ok(src.includes('failedBubbleTitle(m.content)'));
  assert.ok(src.includes('visibleChips('));
});
