// ChatView needs Supabase and profile props to mount, so this reads the source:
// the signed-out gate must run before every local card and the AI call.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const chat = readFileSync('src/components/tabs/ChatView.tsx', 'utf8');
const send = chat.slice(chat.indexOf('async function send('));

test('send() gates a guest before feedback, recap, commands and /api/parse', () => {
  const gate = send.indexOf('signedOutGate(');
  assert.ok(gate > 0);
  for (const later of ['if (feedbackAsk)', 'if (recapAsk)', 'if (commandAsk)', "fetch('/api/parse'"]) {
    assert.ok(send.indexOf(later) > gate, `${later} comes after the gate`);
  }
});

test('the signed-out message renders the Sign in button', () => {
  assert.match(chat, /m\.signInLink \? \([\s\S]{0,600}<SignInChatButton \/>/);
});
