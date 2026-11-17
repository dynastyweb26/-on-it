// TIERS-SPEC.md rule 1: one source of truth for what a plan allows. The plan
// catalog must not carry a limit of its own — every row cell it shows is the
// same value entitlementsFor() returns, for every plan. If either side drifts
// (a hand-written row, a second price), this fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPARISON_ROWS,
  PAID_PLANS,
  PLAN_CATALOG,
  PLAN_MONTHLY_CENTS,
  PLAN_NAMES,
  PLAN_OFFERS,
  PLAN_TRIAL_DAYS,
  PLUS_RETENTION_OFFER,
  SUBSCRIPTION_MANAGE,
  limitsForPlan,
  manageSubscriptionLink,
  rowValueFor,
  type RowKey,
} from './plan-catalog';
import { entitlementsFor, type TierPlan } from './entitlements';
import { TRIAL_DAYS } from './trial';
import { FREE_RECAPS } from './recap/quota';

const PLANS: readonly TierPlan[] = ['free', 'pro', 'plus'];

test('catalog: display names are the one place (Pro, Plus) and Free is Free', () => {
  assert.deepEqual(PLAN_NAMES, { free: 'Free', pro: 'Pro', plus: 'Plus' });
  assert.deepEqual(PLAN_OFFERS.map((p) => p.name), ['Free', 'Pro', 'Plus']);
  assert.deepEqual(PLAN_OFFERS.map((p) => p.plan), PLANS);
});

test('catalog: the two monthly prices are 9.99 and 16.99, in cents', () => {
  assert.deepEqual(PLAN_MONTHLY_CENTS, { pro: 999, plus: 1699 });
  assert.deepEqual(PAID_PLANS, ['pro', 'plus']);
  assert.equal(PLAN_OFFERS[0].monthlyCents, null, 'Free costs nothing');
  assert.equal(PLAN_OFFERS[0].monthlyUsd, null);
  assert.equal(PLAN_OFFERS[1].monthlyUsd, 9.99);
  assert.equal(PLAN_OFFERS[2].monthlyUsd, 16.99);
});

test('catalog: every plan offers the one trial length (lib/trial owns it)', () => {
  assert.equal(PLAN_TRIAL_DAYS, TRIAL_DAYS);
  for (const offer of PLAN_OFFERS) assert.equal(offer.trialDays, 14, offer.plan);
});

test('catalog: a plan offer carries exactly its own entitlements', () => {
  for (const offer of PLAN_OFFERS) {
    assert.deepEqual(offer.limits, entitlementsFor(
      offer.plan === 'free' ? 'free' : 'active',
      offer.plan === 'free' ? null : offer.plan,
    ));
  }
});

test('catalog: every row cell equals entitlements for every plan', () => {
  for (const row of COMPARISON_ROWS) {
    for (const plan of PLANS) {
      assert.deepEqual(
        row[plan],
        rowValueFor(row.key, limitsForPlan(plan)),
        `${row.key}/${plan}`,
      );
    }
  }
});

test('catalog: the rows the founder sells are the rows the limits decide', () => {
  const cell = (key: RowKey, plan: TierPlan) => {
    const row = COMPARISON_ROWS.find((r) => r.key === key);
    assert.ok(row, key);
    return row[plan];
  };
  for (const plan of PLANS) {
    const e = limitsForPlan(plan);
    for (const key of ['invoices', 'estimates', 'expenses'] as const) {
      assert.deepEqual(cell(key, plan), e.unlimitedDocs ? { kind: 'unlimited' } : { kind: 'free' }, `${key}/${plan}`);
    }
    assert.deepEqual(cell('reports', plan), e.canExport ? { kind: 'yes' } : { kind: 'no' }, plan);
    assert.deepEqual(cell('bank', plan), e.canBank ? { kind: 'yes' } : { kind: 'no' }, plan);
    assert.deepEqual(cell('recurring', plan), e.canRecurring ? { kind: 'yes' } : { kind: 'no' }, plan);
    assert.deepEqual(cell('attachments', plan), e.canAttach ? { kind: 'yes' } : { kind: 'no' }, plan);
    assert.deepEqual(cell('ai', plan), { kind: 'count', count: e.aiDailyLimit }, plan);
  }
});

test('catalog: recaps use the free allowance its own module owns', () => {
  assert.deepEqual(COMPARISON_ROWS.find((r) => r.key === 'recaps')?.free, {
    kind: 'count',
    count: FREE_RECAPS,
  });
  assert.deepEqual(COMPARISON_ROWS.find((r) => r.key === 'recaps')?.pro, { kind: 'unlimited' });
  assert.deepEqual(COMPARISON_ROWS.find((r) => r.key === 'recaps')?.plus, { kind: 'unlimited' });
});

test('catalog: the AI row is the plan limit, not a number of its own', () => {
  const ai = COMPARISON_ROWS.find((r) => r.key === 'ai');
  assert.ok(ai);
  assert.deepEqual([ai.free, ai.pro, ai.plus], [
    { kind: 'count', count: entitlementsFor('free', null).aiDailyLimit },
    { kind: 'count', count: entitlementsFor('active', 'pro').aiDailyLimit },
    { kind: 'count', count: entitlementsFor('active', 'plus').aiDailyLimit },
  ]);
  assert.deepEqual([ai.free, ai.pro, ai.plus], [
    { kind: 'count', count: 5 },
    { kind: 'count', count: 30 },
    { kind: 'count', count: 100 },
  ]);
});

test('catalog: one row per feature, in display order, no duplicates', () => {
  assert.deepEqual(COMPARISON_ROWS.map((r) => r.key), [
    'invoices', 'estimates', 'expenses', 'recaps', 'reports', 'ai', 'bank', 'recurring', 'attachments',
  ]);
  assert.equal(new Set(COMPARISON_ROWS.map((r) => r.key)).size, COMPARISON_ROWS.length);
  for (const row of COMPARISON_ROWS) assert.ok(row.label.trim(), row.key);
});

test('catalog: the UI reads the same table the test proves', () => {
  assert.deepEqual(PLAN_CATALOG.plans, PLAN_OFFERS);
  assert.deepEqual(PLAN_CATALOG.rows, COMPARISON_ROWS);
});

test('catalog: the Plus retention offer is a fixed catalog price, not computed', () => {
  assert.equal(PLUS_RETENTION_OFFER.plan, 'plus');
  assert.equal(PLUS_RETENTION_OFFER.percentOff, 50);
  assert.equal(PLUS_RETENTION_OFFER.months, 2);
  // The store's own offer price. 16.99 × 50% is 849.5: the real price is 8.49,
  // and no screen is allowed to round that itself.
  assert.equal(PLUS_RETENTION_OFFER.monthlyCents, 849);
  assert.equal(PLUS_RETENTION_OFFER.monthlyUsd, 8.49);
  assert.equal(PLUS_RETENTION_OFFER.thenCents, PLAN_MONTHLY_CENTS.plus);
  assert.equal(PLUS_RETENTION_OFFER.monthlyCents * 2, 1698, 'the fixed price is not exactly half of 1699');
  assert.equal(PLAN_CATALOG.retentionOffer, PLUS_RETENTION_OFFER);
});

test('catalog: the manage link per billing source (stripe is today’s portal)', () => {
  assert.deepEqual(manageSubscriptionLink('stripe'), { target: 'portal', url: null });
  assert.equal(manageSubscriptionLink('app_store').target, 'app_store');
  assert.equal(manageSubscriptionLink('app_store').url, 'https://apps.apple.com/account/subscriptions');
  assert.equal(manageSubscriptionLink('play_store').target, 'play_store');
  assert.equal(manageSubscriptionLink('play_store').url, 'https://play.google.com/store/account/subscriptions');
  // A Stripe-era profile (no source yet) manages on the web; an unknown value
  // never invents a store page.
  assert.deepEqual(manageSubscriptionLink(null), { target: 'portal', url: null });
  assert.deepEqual(manageSubscriptionLink('bogus'), { target: 'portal', url: null });
  assert.deepEqual(PLAN_CATALOG.manage, SUBSCRIPTION_MANAGE);
});
