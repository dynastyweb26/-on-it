import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRIAL_REMINDER_DAYS } from './trial';

import { planCardFor } from './plan-card';

const RENEW = '2026-12-15T00:00:00.000Z';
const TRIAL_END = '2026-11-29T00:00:00.000Z';

test('plan card: Pro — catalog price, renewal, and the web manage link', () => {
  const card = planCardFor({ tier: 'active', plan: 'pro', currentPeriodEnd: RENEW });

  assert.equal(card.plan, 'pro');
  assert.equal(card.name, 'Pro');
  assert.equal(card.founder, false);
  assert.equal(card.priceCents, 999);
  assert.equal(card.renewalAt, RENEW);
  assert.equal(card.trialEndsAt, null);
  assert.equal(card.pendingChangeTo, null);
  assert.equal(card.billingSource, null);
  assert.deepEqual(card.manage, { target: 'portal', url: null });
  assert.equal(card.canUpgradeToPlus, true);
  assert.equal(card.canSwitchToPro, false);
  assert.equal(card.canKeepPlus, false);
  assert.equal(card.canRestore, true);
});

test('plan card: Plus trial — trial end and the store’s manage page', () => {
  const card = planCardFor({
    tier: 'trialing',
    plan: 'plus',
    trialEndsAt: TRIAL_END,
    currentPeriodEnd: TRIAL_END,
    billingSource: 'app_store',
  });

  assert.equal(card.name, 'Plus');
  assert.equal(card.priceCents, 1699);
  assert.equal(card.trialEndsAt, TRIAL_END);
  assert.equal(card.renewalAt, TRIAL_END);
  assert.equal(card.billingSource, 'app_store');
  assert.deepEqual(card.manage, { target: 'app_store', url: 'https://apps.apple.com/account/subscriptions' });
  // design/tiers 06 (6C): the trial card has no action, so no switch in a trial.
  assert.equal(card.canSwitchToPro, false);
  assert.equal(card.canUpgradeToPlus, false);
  // The reminder date is trial end minus the cron's own TRIAL_REMINDER_DAYS.
  assert.equal(
    Date.parse(card.trialEndsAt!) - Date.parse(card.trialReminderAt!),
    TRIAL_REMINDER_DAYS * 24 * 60 * 60 * 1000,
  );
});

test('plan card: a paid Plus plan (after the trial) can switch to Pro, and has no reminder', () => {
  const card = planCardFor({ tier: 'active', plan: 'plus', currentPeriodEnd: TRIAL_END, billingSource: 'app_store' });
  assert.equal(card.canSwitchToPro, true);
  assert.equal(card.trialReminderAt, null);
});

test('plan card: a pending downgrade says Plus until …, then Pro, with Keep Plus', () => {
  const card = planCardFor({
    tier: 'active',
    plan: 'plus',
    currentPeriodEnd: RENEW,
    planChangeTo: 'pro',
    planChangeAt: RENEW,
    billingSource: 'play_store',
  });

  assert.equal(card.pendingChangeTo, 'pro');
  assert.equal(card.pendingChangeAt, RENEW);
  assert.equal(card.canKeepPlus, true);
  assert.equal(card.canSwitchToPro, false, 'the switch is already pending');
  assert.equal(card.canUpgradeToPlus, false);
});

test('plan card: Free — no price, no renewal, no manage link', () => {
  const card = planCardFor({ tier: 'canceled', plan: 'free', currentPeriodEnd: RENEW, planChangeTo: 'pro' });

  assert.equal(card.plan, 'free');
  assert.equal(card.name, 'Free');
  assert.equal(card.priceCents, null);
  assert.equal(card.renewalAt, null);
  assert.equal(card.trialEndsAt, null);
  assert.equal(card.pendingChangeTo, null, 'nothing is pending on a lapsed subscription');
  assert.equal(card.manage, null);
  assert.equal(card.canUpgradeToPlus, false);
  assert.equal(card.canRestore, true);
});

test('plan card: founder — Plus, free forever, no actions and no manage link', () => {
  const card = planCardFor({ tier: 'founder', plan: 'plus', currentPeriodEnd: RENEW, billingSource: 'stripe' });

  assert.equal(card.name, 'Founder');
  assert.equal(card.plan, 'plus');
  assert.equal(card.founder, true);
  assert.equal(card.priceCents, null);
  assert.equal(card.manage, null);
  assert.equal(card.canRestore, false);
  assert.deepEqual(
    [card.canUpgradeToPlus, card.canSwitchToPro, card.canKeepPlus, card.canRestore],
    [false, false, false, false],
  );
});

test('plan card: an active row with no paid plan reads Free, at no price', () => {
  const card = planCardFor({ tier: 'active', plan: 'free' });

  assert.equal(card.name, 'Free');
  assert.equal(card.priceCents, null);
  assert.equal(card.canUpgradeToPlus, false);
});
