import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const chat = readFileSync('src/components/tabs/ChatView.tsx', 'utf8');

test('the open-time recap goes through the dice, and posts an `auto` card', () => {
  const effect = chat.slice(chat.indexOf('const recapRanRef'), chat.indexOf('const mountedAtRef'));
  assert.match(effect, /decideAutoRecap\(now, state, Math\.random\)/);
  assert.match(effect, /auto: true/);
  assert.doesNotMatch(effect, /recapsDue/);
});

test('an auto recap is not saved with the thread', () => {
  assert.match(chat, /messages\.filter\(\(m\) => !m\.auto\)/);
});

test('an asked-for recap is never gated by the dice', () => {
  const asked = chat.slice(chat.indexOf('if (recapAsk) {'), chat.indexOf('if (commandAsk) {'));
  assert.match(asked, /mode: 'now'/);
  assert.doesNotMatch(asked, /decideAutoRecap|recapStateKey/);
});
