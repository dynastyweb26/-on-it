import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRIAL_REMINDER_DAYS } from './trial';
import { parseDismissed, pickSoftPrompt, withDismissed, type PromptFacts } from './soft-prompts';

const NOW = new Date('2026-10-25T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const base: PromptFacts = {
  tier: 'free', trialEndsAt: null, webhookPayments: 0, lastWebhookPaymentAt: null,
  estimatesSigned: 0, lastEstimateSignedAt: null, now: NOW,
};
const pick = (over: Partial<PromptFacts>) => pickSoftPrompt({ ...base, ...over });

test('canceled tier gets the winback prompt, whatever else happened', () => {
  const p = pick({ tier: 'canceled', estimatesSigned: 1, webhookPayments: 1 });
  assert.equal(p?.id, 'winback');
  assert.equal(p?.variant, 'winback');
});

test('trial prompt opens TRIAL_REMINDER_DAYS before the end and stops at the end', () => {
  const end = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();
  assert.equal(pick({ tier: 'trialing', trialEndsAt: end(TRIAL_REMINDER_DAYS + 0.5) }), null);
  const p = pick({ tier: 'trialing', trialEndsAt: end(TRIAL_REMINDER_DAYS - 0.5) });
  assert.equal(p?.id, 'trial-ending');
  assert.equal(p?.action, 'plan');
  assert.equal(pick({ tier: 'trialing', trialEndsAt: end(-1) }), null);
  assert.equal(pick({ tier: 'trialing', trialEndsAt: null }), null);
});

test('a signed estimate or a single webhook payment nudges a free user', () => {
  assert.equal(pick({ estimatesSigned: 1, lastEstimateSignedAt: 'x' })?.id, 'estimate-signed');
  assert.equal(pick({ webhookPayments: 1, lastWebhookPaymentAt: 'y' })?.id, 'first-payment');
  assert.equal(pick({ webhookPayments: 1, lastWebhookPaymentAt: 'y' })?.key, 'first-payment:y');
});

test('two or more webhook payments, or nothing at all, say nothing', () => {
  assert.equal(pick({ webhookPayments: 2 }), null);
  assert.equal(pick({}), null);
});

test('an estimate signed wins over a payment (one card at a time)', () => {
  assert.equal(pick({ estimatesSigned: 1, webhookPayments: 1 })?.id, 'estimate-signed');
});

test('paid tiers get no estimate or payment nudge', () => {
  for (const tier of ['active', 'past_due', 'founder']) {
    assert.equal(pick({ tier, estimatesSigned: 1, webhookPayments: 1 }), null);
  }
});

test('dismissals are parsed defensively and capped', () => {
  assert.deepEqual(parseDismissed(null), []);
  assert.deepEqual(parseDismissed('not json'), []);
  assert.deepEqual(parseDismissed('{"a":1}'), []);
  assert.deepEqual(parseDismissed('["a",1,"b"]'), ['a', 'b']);
  assert.deepEqual(withDismissed(['a', 'b'], 'a'), ['b', 'a']);
  const many = Array.from({ length: 40 }, (_, i) => `k${i}`);
  assert.equal(withDismissed(many, 'new').length, 30);
  assert.equal(withDismissed(many, 'new').at(-1), 'new');
});
