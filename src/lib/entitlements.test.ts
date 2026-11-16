import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entitlementsFor, isPlusPlan, type TierPlan } from './entitlements';

// TIERS-SPEC.md, "Plans" — the table this file proves, written once here so a
// limit cannot drift from the spec without this test failing.
const EXPECTED: Record<TierPlan, ReturnType<typeof entitlementsFor>> = {
  free: {
    plan: 'free',
    aiDailyLimit: 5,
    canBank: false,
    canRecurring: false,
    canAttach: false,
    canExport: false,
    unlimitedDocs: false,
  },
  pro: {
    plan: 'pro',
    aiDailyLimit: 30,
    canBank: false,
    canRecurring: false,
    canAttach: false,
    canExport: true,
    unlimitedDocs: true,
  },
  plus: {
    plan: 'plus',
    aiDailyLimit: 100,
    canBank: true,
    canRecurring: true,
    canAttach: true,
    canExport: true,
    unlimitedDocs: true,
  },
};

// Every access_tier value the app can store, plus the shapes a legacy or
// unexpected row can produce.
const TIERS: Array<string | null | undefined> = [
  'free', 'trialing', 'active', 'past_due', 'canceled', 'founder', 'standard', '', null, undefined,
];
const PLANS: Array<string | null | undefined> = [null, undefined, 'pro', 'plus', 'other'];

// A paid tier is the only place plan matters; founder is always plus; a
// non-paying tier is free no matter what plan is stored (access decides).
function expectedPlan(tier: string | null | undefined, plan: string | null | undefined): TierPlan {
  if (tier === 'founder') return 'plus';
  if (tier === 'trialing' || tier === 'active' || tier === 'past_due') {
    return plan === 'plus' ? 'plus' : 'pro';
  }
  return 'free';
}

test('entitlements: every tier × plan pair resolves to the spec table', () => {
  for (const tier of TIERS) {
    for (const plan of PLANS) {
      const got = entitlementsFor(tier, plan);
      const label = `tier=${String(tier)} plan=${String(plan)}`;
      const want = expectedPlan(tier, plan);
      assert.equal(got.plan, want, label);
      assert.deepEqual(got, EXPECTED[want], label);
    }
  }
});

test('entitlements: a paid tier with no plan is Pro (subscriptions before plans)', () => {
  for (const tier of ['trialing', 'active', 'past_due']) {
    assert.equal(entitlementsFor(tier, null).plan, 'pro', tier);
    assert.equal(entitlementsFor(tier, undefined).aiDailyLimit, 30, tier);
  }
});

test('entitlements: a founder is Plus even with a stale or missing plan', () => {
  for (const plan of PLANS) {
    assert.equal(entitlementsFor('founder', plan).plan, 'plus', String(plan));
    assert.equal(entitlementsFor('founder', plan).aiDailyLimit, 100, String(plan));
  }
});

test('entitlements: canceled keeps its stored plan but not its access', () => {
  // access_tier decides access; the plan value survives for a resubscribe.
  assert.equal(entitlementsFor('canceled', 'plus').plan, 'free');
  assert.equal(entitlementsFor('canceled', 'pro').canBank, false);
  assert.equal(entitlementsFor('canceled', 'plus').unlimitedDocs, false);
});

test('entitlements: only Plus opens bank, recurring and attachments', () => {
  for (const tier of ['free', 'canceled']) {
    const e = entitlementsFor(tier, 'plus');
    assert.deepEqual([e.canBank, e.canRecurring, e.canAttach], [false, false, false], tier);
  }
  const pro = entitlementsFor('active', 'pro');
  assert.deepEqual([pro.canBank, pro.canRecurring, pro.canAttach], [false, false, false]);
  const plus = entitlementsFor('active', 'plus');
  assert.deepEqual([plus.canBank, plus.canRecurring, plus.canAttach], [true, true, true]);
});

test('entitlements: AI limits are 5 / 30 / 100', () => {
  assert.equal(entitlementsFor('free', null).aiDailyLimit, 5);
  assert.equal(entitlementsFor('active', 'pro').aiDailyLimit, 30);
  assert.equal(entitlementsFor('founder', null).aiDailyLimit, 100);
});

test('isPlusPlan: the same table, one answer (never a plan-name compare)', () => {
  for (const tier of TIERS) {
    for (const plan of PLANS) {
      assert.equal(
        isPlusPlan(tier, plan),
        entitlementsFor(tier, plan).plan === 'plus',
        `${String(tier)}/${String(plan)}`,
      );
    }
  }
  assert.equal(isPlusPlan('founder', null), true);
  assert.equal(isPlusPlan('active', 'pro'), false);
});

test('entitlements: a fresh object each call (a caller cannot poison the table)', () => {
  const a = entitlementsFor('active', 'plus');
  a.canBank = false;
  a.aiDailyLimit = 5;
  assert.deepEqual(entitlementsFor('active', 'plus'), EXPECTED.plus);
});

test('planLabel: the name beside the Settings title', async () => {
  const { planLabel } = await import('./entitlements');
  assert.equal(planLabel('free', null), 'Free');
  assert.equal(planLabel(null, null), 'Free');
  assert.equal(planLabel('canceled', 'plus'), 'Free'); // stored plan, no access
  assert.equal(planLabel('trialing', null), 'Pro');
  assert.equal(planLabel('active', 'pro'), 'Pro');
  assert.equal(planLabel('past_due', 'plus'), 'Plus');
  assert.equal(planLabel('active', 'plus'), 'Plus');
  assert.equal(planLabel('founder', null), 'Founder');
  assert.equal(planLabel('founder', 'pro'), 'Founder');
});
