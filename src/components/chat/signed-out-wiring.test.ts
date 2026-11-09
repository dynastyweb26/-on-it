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
  assert.match(chat, /m\.signInLink \? \([\s\S]{0,600}<SignInChatButton[\s>]/);
});

test('the empty-state chips are a random pick, not a fixed list', () => {
  assert.match(chat, /useMemo\(\(\) => pickStarterChips\(\)/);
  assert.match(chat, /starterChips\.map\(/);
  assert.doesNotMatch(chat, /STARTER_CHIPS/);
});

test('chips and "What I can do" rows both fill the composer through prefillFor, never send', () => {
  assert.match(chat, /onPick=\{\(label\) => fillComposer\(prefillFor\(label\)\)\}/);
  // Record a payment is the one exception: a button that opens the card (see
  // payment-card-wiring.test.ts). Every other chip still fills through prefillFor.
  assert.match(chat, /isRecordPaymentChip\(chip\) \? openPaymentCard\(\) : fillComposer\(prefillFor\(chip\)\)/);
  assert.match(chat, /onAction=\{\(action\) => \{ if \(action === 'record-payment'\) openPaymentCard\(\); \}\}/);
  const fill = chat.slice(chat.indexOf('const fillComposer'), chat.indexOf('const [signInAsk'));
  assert.match(fill, /setInput\(text\)/);
  assert.match(fill, /el\.focus\(\)/);
  assert.match(fill, /setSelectionRange\(text\.length, text\.length\)/);
  assert.doesNotMatch(fill, /send\(/);
});

test('the chip label still shows the example', () => {
  assert.match(chat, /<Icon name="auto_awesome"[^>]*\/>\s*\{chip\}/);
});
