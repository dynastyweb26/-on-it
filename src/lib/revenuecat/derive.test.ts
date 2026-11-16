// One fixture per lifecycle moment the founder listed: new trial, trial
// converted, renewal, upgrade pro → plus, downgrade scheduled, downgrade landed,
// cancelled but still in period, expired, billing issue (then recovered) and a
// refund. Each file is the documented subscriber JSON plus the expected write.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deriveRevenueCatState, type DerivedState } from './derive';
import { baseProductId, planForProduct, planRank } from './products';

interface Fixture {
  now: string;
  subscriber: unknown;
  expected: DerivedState;
}

const dir = new URL('./__fixtures__/', import.meta.url);

for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  test(`derive: ${file.replace('.json', '')}`, () => {
    const fixture = JSON.parse(readFileSync(new URL(file, dir), 'utf8')) as Fixture;
    const logged: string[] = [];
    const state = deriveRevenueCatState(
      fixture.subscriber as never,
      new Date(fixture.now),
      (message) => logged.push(message),
    );
    assert.deepEqual(state, fixture.expected);
    assert.deepEqual(logged, [], 'no unknown entitlement, product or store');
  });
}

test('derive: every fixture is present (a missing file cannot pass silently)', () => {
  const names = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  for (const required of [
    'billing-issue', 'billing-recovered', 'cancelled-in-period', 'downgrade-landed',
    'downgrade-scheduled', 'expired', 'new-trial', 'refunded', 'renewal-play',
    'trial-converted', 'upgrade-plus',
  ]) {
    assert.ok(names.includes(`${required}.json`), `${required}.json`);
  }
});

// ── Defensive paths ──────────────────────────────────────────────────────

const NOW = new Date('2026-12-01T12:00:00Z');

test('derive: an unknown entitlement id is ignored and logged', () => {
  const logged: string[] = [];
  const state = deriveRevenueCatState({
    entitlements: {
      pro: { product_identifier: 'onit_pro_monthly', expires_date: '2027-01-01T00:00:00Z' },
      legacy_vip: { product_identifier: 'whatever', expires_date: '2027-01-01T00:00:00Z' },
    },
    subscriptions: { onit_pro_monthly: { expires_date: '2027-01-01T00:00:00Z', store: 'app_store', period_type: 'normal' } },
  }, NOW, (m) => logged.push(m));
  assert.equal(state.plan, 'pro');
  assert.deepEqual(logged, ['unknown_entitlement']);
});

test('derive: an active entitlement with an unknown product is not active', () => {
  const logged: string[] = [];
  const state = deriveRevenueCatState({
    entitlements: { pro: { product_identifier: 'onit_mystery_monthly', expires_date: '2027-01-01T00:00:00Z' } },
    subscriptions: {},
  }, NOW, (m) => logged.push(m));
  assert.equal(state.plan, null);
  assert.equal(state.tier, 'canceled');
  assert.deepEqual(logged, ['unknown_product']);
});

test('derive: a store we do not bill through leaves billingSource null', () => {
  const logged: string[] = [];
  const state = deriveRevenueCatState({
    entitlements: { pro: { product_identifier: 'onit_pro_monthly', expires_date: '2027-01-01T00:00:00Z' } },
    subscriptions: {
      onit_pro_monthly: { expires_date: '2027-01-01T00:00:00Z', store: 'promotional', period_type: 'normal' },
    },
  }, NOW, (m) => logged.push(m));
  assert.equal(state.plan, 'pro');
  assert.equal(state.billingSource, null);
  assert.deepEqual(logged, ['unknown_store']);
});

test('derive: a family-shared promo with no subscription is never a plan', () => {
  const state = deriveRevenueCatState({
    entitlements: { plus: { product_identifier: 'rc_promo_plus', expires_date: '2027-01-01T00:00:00Z' } },
    subscriptions: {},
  }, NOW);
  assert.equal(state.plan, null);
  assert.equal(state.tier, 'canceled');
});

// ── Products ─────────────────────────────────────────────────────────────

test('products: the founder’s four ids map, and Play base plans are matched', () => {
  assert.equal(planForProduct('onit_pro_monthly'), 'pro');
  assert.equal(planForProduct('onit_plus_monthly'), 'plus');
  // Google Play webhook/subscriber ids carry `<subscription_id>:<base_plan_id>`.
  assert.equal(planForProduct('onit_pro_monthly:p1m'), 'pro');
  assert.equal(planForProduct('onit_plus_monthly:monthly'), 'plus');
  assert.equal(planForProduct(' onit_plus_monthly '), 'plus');
  // Anything else is not ours (item 4 leaves a pending change untouched).
  assert.equal(planForProduct('onit_plus_yearly'), null);
  assert.equal(planForProduct('some_other_app_plus'), null);
  assert.equal(planForProduct(null), null);
  assert.equal(planForProduct(''), null);
  assert.equal(baseProductId('onit_pro_monthly:p1m'), 'onit_pro_monthly');
  assert.equal(planRank('pro'), 1);
  assert.equal(planRank('plus'), 2);
});
