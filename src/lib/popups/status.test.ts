import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SHARE_NOT_OPENED_TEXT, UNREADABLE_PRICES_TEXT, signInCard } from './status';

test('signInCard: guest send keeps the headline verbatim and says the draft stays', () => {
  const c = signInCard('send');
  assert.equal(c.title, "Let's save your work — sign in to send this invoice.");
  assert.equal(c.text, 'Your draft stays right here.');
  assert.equal(c.signInLabel, 'Sign in');
  assert.equal(c.secondaryLabel, 'Keep editing');
  assert.equal(c.secondary, 'dismiss');
});

test('signInCard: the server headline wins when it sent one', () => {
  assert.equal(signInCard('send', 'Create your free account to keep going.').title, 'Create your free account to keep going.');
  assert.equal(signInCard('voice', '  ').title, 'Create your free account to keep going.');
});

test('signInCard: voice offers Type instead, expense says "expense"', () => {
  const v = signInCard('voice');
  assert.equal(v.signInLabel, 'Create free account');
  assert.equal(v.secondary, 'type');
  assert.equal(v.secondaryLabel, 'Type instead');
  const e = signInCard('expense');
  assert.equal(e.title, "Let's save your work — sign in to keep this expense.");
  assert.equal(e.text, 'Your expense stays right here.');
});

test('P-82 copy no longer blames the user; P-67 copy has no error name', () => {
  assert.equal(UNREADABLE_PRICES_TEXT, 'I couldn’t read these prices. Say each one again, like “Car wash $200”.');
  assert.ok(!/try rephrasing/i.test(UNREADABLE_PRICES_TEXT));
  assert.ok(!/NotAllowedError|\(/.test(SHARE_NOT_OPENED_TEXT));
});

// The 1600 ms auto-redirect is gone: sign-in is always a tap. This fails if any
// `setTimeout(() => router.push('/login'), …)` comes back to the chat.
test('ChatView never auto-redirects to /login', () => {
  const src = readFileSync(new URL('../../components/tabs/ChatView.tsx', import.meta.url), 'utf8');
  assert.ok(!/setTimeout\(\s*\(\)\s*=>\s*router\.push\(\s*['"]\/login['"]\s*\)/.test(src));
  assert.ok(!src.includes("'redirecting'"));
});

// Board 7 / T2: every undoable delete shares one toast, so it gets the pending
// and failed-restore states at once. This fails if UndoToast goes back to a
// fire-and-forget button with no Restoring… state.
test('UndoToast is the kit toast with a Restoring… state', () => {
  const src = readFileSync(new URL('../../components/UndoToast.tsx', import.meta.url), 'utf8');
  assert.ok(src.includes("from '@/components/popups/PopToast'"));
  assert.ok(src.includes("busyLabel: 'Restoring…'"));
});

import { ESTIMATE_OFFLINE_TEXT, paymentAttentionText, paywallDismissible } from './status';

test('L1: nothing closes the paywall while a purchase or restore is in flight', () => {
  assert.equal(paywallDismissible({ busy: false, buying: false, restoring: false }), true);
  assert.equal(paywallDismissible({ busy: true, buying: false, restoring: false }), false);
  assert.equal(paywallDismissible({ busy: false, buying: true, restoring: false }), false);
  assert.equal(paywallDismissible({ busy: false, buying: false, restoring: true }), false);
});

test('L1: the ×, Escape and scrim all go through the guarded dismiss', () => {
  const src = readFileSync('src/components/PaywallModal.tsx', 'utf8');
  assert.match(src, /Escape'\) \{ dismiss\(\)/);
  assert.match(src, /e\.target === e\.currentTarget\) dismiss\(\)/);
  assert.match(src, /aria-label="Not now"\s*onClick=\{dismiss\}/);
  assert.doesNotMatch(src, /onClick=\{onClose\}/);
});

test('S7b: a payment that needs attention names the reason, and says what happened without one', () => {
  assert.equal(paymentAttentionText('INV-0007 changed on another device.'),
    'This payment could not be recorded. Reason: INV-0007 changed on another device.');
  assert.equal(paymentAttentionText(undefined), 'This payment could not be recorded.');
  assert.equal(paymentAttentionText('  '), 'This payment could not be recorded.');
});

test('S7b: Retry ignores a second tap and shows it is running', () => {
  const screen = readFileSync('src/components/invoice-detail/InvoiceDetailScreen.tsx', 'utf8');
  assert.match(screen, /if \(retryingQueueRef\.current\) return;/);
  assert.match(screen, /retrying=\{retryingQueue\}/);
  const notice = readFileSync('src/components/invoice-detail/PendingPaymentNotice.tsx', 'utf8');
  assert.match(notice, /retrying \? 'Retrying…' : 'Retry'/);
});

test('S3: the offline estimate sentence names the estimate and keeps the draft safe', () => {
  assert.equal(ESTIMATE_OFFLINE_TEXT, 'You’re offline — the estimate didn’t send. Your draft is safe.');
});
