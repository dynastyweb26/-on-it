import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FeedbackBody, cleanMessage, feedbackEmail, shouldAskForFeedback, afterShown, afterDismiss,
  parsePromptState, EMPTY_PROMPT_STATE, type PromptContext,
} from './feedback';

const DAY = 86_400_000;
const ok = { tag: 'idea', message: 'Please add recurring invoices' };

test('body: valid minimal input passes, source defaults to settings', () => {
  const r = FeedbackBody.safeParse(ok);
  assert.equal(r.success, true);
  if (r.success) assert.equal(r.data.source, 'settings');
});

test('body: tag must be one of idea / problem / love', () => {
  assert.equal(FeedbackBody.safeParse({ ...ok, tag: 'bug' }).success, false);
  for (const tag of ['idea', 'problem', 'love']) assert.equal(FeedbackBody.safeParse({ ...ok, tag }).success, true);
});

test('body: message length is checked after cleaning', () => {
  assert.equal(FeedbackBody.safeParse({ ...ok, message: 'hey' }).success, false);
  assert.equal(FeedbackBody.safeParse({ ...ok, message: '   \u0000\u0001  ab  ' }).success, false);
  assert.equal(FeedbackBody.safeParse({ ...ok, message: 'x'.repeat(2000) }).success, true);
  assert.equal(FeedbackBody.safeParse({ ...ok, message: 'x'.repeat(2001) }).success, false);
});

test('body: rating must be an integer 1 to 5 when present', () => {
  for (const rating of [0, 6, 2.5, -1]) assert.equal(FeedbackBody.safeParse({ ...ok, rating }).success, false);
  for (const rating of [1, 3, 5]) assert.equal(FeedbackBody.safeParse({ ...ok, rating }).success, true);
});

test('body: source must be known; screen and version are single-line and bounded', () => {
  assert.equal(FeedbackBody.safeParse({ ...ok, source: 'email' }).success, false);
  const r = FeedbackBody.parse({ ...ok, screen: '/chat\nBcc: x', appVersion: 'v'.repeat(100) });
  assert.equal(r.screen, '/chat Bcc: x');
  assert.equal(r.appVersion?.length, 40);
});

test('cleanMessage keeps newlines and tabs, drops other control characters, normalizes NFKC and strips format control characters', () => {
  // \u200B is zero-width space (\p{Cf}), Ｆｕｌｌｗｉｄｔｈ is NFKC normalized
  assert.equal(cleanMessage('a\r\nb\u0000\tc\u0007\u200B Ｆｕｌｌ'), 'a\nb\tc Full');
});

test('cleanLine normalizes NFKC and strips format control characters', () => {
  assert.equal(cleanLine(' /chat\u200B\n Bｃｃ: evil ', 60), '/chat Bcc: evil');
});

test('email: subject has no newlines, html escapes the message, reply-to line present', () => {
  const e = feedbackEmail({
    tag: 'problem', message: '<script>alert(1)</script>\nsecond line', rating: 2, source: 'chat_prompt',
    screen: '/chat', appVersion: '1.0', businessName: 'Joe\nBcc: evil', userEmail: 'joe@example.com',
  });
  assert.equal(/[\r\n]/.test(e.subject), false);
  assert.match(e.subject, /problem/);
  assert.equal(e.html.includes('<script>'), false);
  assert.match(e.html, /&lt;script&gt;/);
  assert.match(e.text, /Stars: 2\/5/);
  assert.match(e.text, /Chat prompt/);
  assert.match(e.text, /joe@example\.com/);
});

test('email: no business name reads "new user"', () => {
  const e = feedbackEmail({ tag: 'love', message: 'Great app', source: 'settings' });
  assert.match(e.subject, /new user/);
});

const base: PromptContext = {
  now: 1_000 * DAY, docsSent: 3, moment: true, hasSubmitted: false, blocked: false, state: EMPTY_PROMPT_STATE,
};

test('prompt: asks after a moment once 3 documents are sent', () => {
  assert.equal(shouldAskForFeedback(base), true);
  assert.equal(shouldAskForFeedback({ ...base, docsSent: 2 }), false);
  assert.equal(shouldAskForFeedback({ ...base, moment: false }), false);
});

test('prompt: never asks again once feedback was submitted (any device)', () => {
  assert.equal(shouldAskForFeedback({ ...base, hasSubmitted: true }), false);
  assert.equal(shouldAskForFeedback({ ...base, hasSubmitted: true, state: EMPTY_PROMPT_STATE }), false);
});

test('prompt: never during voice, template, paywall or tour', () => {
  assert.equal(shouldAskForFeedback({ ...base, blocked: true }), false);
});

test('prompt: shown once, then quiet for 21 days', () => {
  const s = afterShown(EMPTY_PROMPT_STATE, base.now);
  assert.equal(shouldAskForFeedback({ ...base, state: s, now: base.now + 20 * DAY }), false);
  assert.equal(shouldAskForFeedback({ ...base, state: s, now: base.now + 21 * DAY }), true);
});

test('prompt: one dismissal snoozes 21 days; two in a row snooze 60 and reset the count', () => {
  const d1 = afterDismiss(EMPTY_PROMPT_STATE, base.now);
  assert.equal(d1.dismissals, 1);
  assert.equal(shouldAskForFeedback({ ...base, state: d1, now: base.now + 21 * DAY }), true);
  const t2 = base.now + 21 * DAY;
  const d2 = afterDismiss(d1, t2);
  assert.equal(d2.dismissals, 0);
  assert.equal(shouldAskForFeedback({ ...base, state: d2, now: t2 + 59 * DAY }), false);
  assert.equal(shouldAskForFeedback({ ...base, state: d2, now: t2 + 60 * DAY }), true);
});

test('prompt state: tolerant parse', () => {
  assert.deepEqual(parsePromptState(null), EMPTY_PROMPT_STATE);
  assert.deepEqual(parsePromptState('not json'), EMPTY_PROMPT_STATE);
  assert.deepEqual(parsePromptState('{"lastShownAt":"x","dismissals":99}'), { lastShownAt: null, snoozedUntil: null, dismissals: 2 });
  const s = afterDismiss(EMPTY_PROMPT_STATE, 5);
  assert.deepEqual(parsePromptState(JSON.stringify(s)), s);
});
