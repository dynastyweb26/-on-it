// The Record a payment button is wired to open the card, never to send a
// message, and its guard is a synchronous ref (interaction rule 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const chat = readFileSync(new URL('../tabs/ChatView.tsx', import.meta.url), 'utf8');
const open = chat.slice(chat.indexOf('function openPaymentCard'), chat.indexOf('async function loadPaymentPicker'));

test('openPaymentCard guards with a ref and adds a picker card without sending', () => {
  assert.match(chat, /const payCardPendingRef = useRef<string \| null>\(null\)/);
  assert.match(open, /openPaymentCardTarget\(messages, payCardPendingRef\.current\)/);
  assert.match(open, /payCardPendingRef\.current = msg\.id/);
  assert.match(open, /picker: true/);
  assert.doesNotMatch(open, /send\(|\/api\/parse/);
});

test('the pending ref clears once no payment card is open', () => {
  assert.match(chat, /payCardPendingRef\.current && !messages\.some\(\(x\) => x\.payProposal != null\)\) payCardPendingRef\.current = null/);
});

test('the card gets its loader only for the button\'s card', () => {
  assert.match(chat, /loadPicker=\{m\.payProposal\.picker \? loadPaymentPicker : undefined\}/);
});
