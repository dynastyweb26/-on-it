import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  offerStatusFor,
  switchProDecision,
  takeSwitchProOffer,
  type SwitchProDeps,
  type SwitchProProfile,
} from './switch-offer';
import { OFFER_WINDOW_MS } from './offers';

const NOW = new Date('2026-11-17T12:00:00Z');
const LIVE = { status: 'active', cancelAtPeriodEnd: false, paused: false, retentionOfferUsedAt: null };
const DAY_MS = 24 * 60 * 60 * 1000;

// A store-billed Plus profile exactly as the RevenueCat webhook leaves it:
// no Stripe customer, no Stripe subscription — Plus is never sold on Stripe.
const STORE_PLUS: SwitchProProfile = {
  access_tier: 'active',
  plan: 'plus',
  billing_source: 'app_store',
  // The RevenueCat webhook never writes this column (it is the Stripe sync's).
  subscription_status: null,
  retention_offer_used_at: null,
  cancel_at_period_end: false,
  paused_until: null,
};

function run(overrides: Partial<SwitchProDeps> = {}) {
  const order: string[] = [];
  const deps: SwitchProDeps = {
    tiersOn: true,
    profile: STORE_PLUS,
    now: NOW,
    claimWindow: async () => { order.push('claim'); return 'claimed'; },
    logOffer: async () => { order.push('log'); },
    ...overrides,
  };
  return { deps, order };
}

// ── The decision (pure) ─────────────────────────────────────────────

test('switch to Pro: a Plus user with no offer used may take it', () => {
  assert.deepEqual(
    switchProDecision({ plan: 'plus', offer: LIVE, billingSource: 'stripe', now: NOW, tiersOn: true }),
    { ok: true },
  );
});

test('switch to Pro: a Pro user cannot take it', () => {
  assert.deepEqual(
    switchProDecision({ plan: 'pro', offer: LIVE, now: NOW, tiersOn: true }),
    { ok: false, error: 'not_eligible' },
  );
  assert.deepEqual(
    switchProDecision({ plan: 'free', offer: LIVE, now: NOW, tiersOn: true }),
    { ok: false, error: 'not_eligible' },
  );
});

test('switch to Pro: a second offer inside 12 months is refused', () => {
  const inside = new Date(NOW.getTime() - 60 * DAY_MS).toISOString();
  assert.deepEqual(
    switchProDecision({ plan: 'plus', offer: { ...LIVE, retentionOfferUsedAt: inside }, now: NOW, tiersOn: true }),
    { ok: false, error: 'not_eligible' },
  );

  const outside = new Date(NOW.getTime() - OFFER_WINDOW_MS - DAY_MS).toISOString();
  assert.deepEqual(
    switchProDecision({ plan: 'plus', offer: { ...LIVE, retentionOfferUsedAt: outside }, now: NOW, tiersOn: true }),
    { ok: true },
  );
});

test('switch to Pro: only a live subscription that is not already canceling or paused', () => {
  for (const offer of [
    { ...LIVE, status: 'past_due' },
    { ...LIVE, status: 'canceled' },
    { ...LIVE, cancelAtPeriodEnd: true },
    { ...LIVE, paused: true },
  ]) {
    assert.deepEqual(
      switchProDecision({ plan: 'plus', offer, now: NOW, tiersOn: true }),
      { ok: false, error: 'not_eligible' },
      offer.status,
    );
  }
  // A trial may switch: the store applies it at renewal, like any downgrade.
  assert.deepEqual(
    switchProDecision({ plan: 'plus', offer: { ...LIVE, status: 'trialing' }, now: NOW, tiersOn: true }),
    { ok: true },
  );
});

test('switch to Pro: a store account allows it (a change inside the store group)', () => {
  assert.deepEqual(
    switchProDecision({ plan: 'plus', offer: LIVE, billingSource: 'app_store', now: NOW, tiersOn: true }),
    { ok: true },
  );
  assert.deepEqual(
    switchProDecision({ plan: 'plus', offer: LIVE, billingSource: 'play_store', now: NOW, tiersOn: true }),
    { ok: true },
  );
});

test('switch to Pro: with the flag off the kind does not exist', () => {
  assert.deepEqual(
    switchProDecision({ plan: 'plus', offer: LIVE, now: NOW, tiersOn: false }),
    { ok: false, error: 'not_available' },
  );
});

// ── Taking it (the route's switch_pro path) ─────────────────────────

test('route: a store-billed Plus user with no Stripe customer records the offer', async () => {
  const { deps, order } = run();
  // Nothing here can reach Stripe: the profile has no customer id at all, and
  // the deps have no Stripe seam to call.
  assert.equal('stripe_customer_id' in deps.profile, false);

  assert.deepEqual(await takeSwitchProOffer(deps), { ok: true });
  assert.deepEqual(order, ['claim', 'log'], 'the claim first, then the event');
});

test('route: a Stripe Pro user is still refused', async () => {
  const { deps, order } = run({ profile: { ...STORE_PLUS, billing_source: 'stripe', plan: 'pro' } });

  assert.deepEqual(await takeSwitchProOffer(deps), { ok: false, status: 409, error: 'not_eligible' });
  assert.deepEqual(order, [], 'nothing is written');
});

test('route: a store-billed user already canceling is refused', async () => {
  const canceling = run({ profile: { ...STORE_PLUS, cancel_at_period_end: true } });
  assert.deepEqual(await takeSwitchProOffer(canceling.deps), { ok: false, status: 409, error: 'not_eligible' });
  assert.deepEqual(canceling.order, []);

  // Paused reads the same way (paused_until is what the webhook writes).
  const paused = run({ profile: { ...STORE_PLUS, paused_until: '2027-01-16T00:00:00.000Z' } });
  assert.deepEqual(await takeSwitchProOffer(paused.deps), { ok: false, status: 409, error: 'not_eligible' });
  assert.deepEqual(paused.order, []);
});

test('route: flag off is today’s 400 and writes nothing', async () => {
  const { deps, order } = run({ tiersOn: false });

  assert.deepEqual(await takeSwitchProOffer(deps), { ok: false, status: 400, error: 'bad_request' });
  assert.deepEqual(order, []);
});

test('route: an offer already taken inside 12 months writes nothing', async () => {
  const inside = new Date(NOW.getTime() - 60 * DAY_MS).toISOString();
  const { deps, order } = run({ profile: { ...STORE_PLUS, retention_offer_used_at: inside } });

  assert.deepEqual(await takeSwitchProOffer(deps), { ok: false, status: 409, error: 'not_eligible' });
  assert.deepEqual(order, [], 'refused before the claim, so no window is spent');
});

test('route: a claim that loses the race logs nothing', async () => {
  const { deps, order } = run({ claimWindow: async () => { order.push('claim'); return 'not_eligible'; } });

  assert.deepEqual(await takeSwitchProOffer(deps), { ok: false, status: 409, error: 'not_eligible' });
  assert.deepEqual(order, ['claim'], 'the claim refused it; no event');
});

test('route: a failed claim is a 500 with no event', async () => {
  const { deps, order } = run({ claimWindow: async () => { order.push('claim'); return 'error'; } });

  assert.deepEqual(await takeSwitchProOffer(deps), { ok: false, status: 500, error: 'failed' });
  assert.deepEqual(order, ['claim']);
});

test('route: the real billing source reaches the decision, never a fixed stripe', () => {
  const src = readFileSync(new URL('./switch-offer.ts', import.meta.url), 'utf8');
  assert.match(src, /billingSource: p\.billing_source/);
  assert.doesNotMatch(src, /billingSource: 'stripe'/);
});

// ── The route's wiring ──────────────────────────────────────────────

test('route source: switch_pro stays off the Stripe subscription context', () => {
  const src = readFileSync(new URL('../../app/api/subscription/offer/route.ts', import.meta.url), 'utf8');
  const branch = src.slice(
    src.indexOf("if (kind === 'switch_pro')"),
    src.indexOf('const ctx = await subscriptionContext(req)'),
  );
  assert.ok(branch.length > 0, 'the switch_pro branch exists before the Stripe path');
  assert.match(branch, /storeOfferContext\(req\)/);
  assert.doesNotMatch(branch, /subscriptionContext/);
  assert.match(branch, /profile: ctx\.profile/);
  // The one atomic claim, then the event (never the other way round).
  assert.match(branch, /retention_offer_used_at: now\.toISOString\(\)/);
  assert.match(branch, /kind: 'offer_switch_pro', reason: 'price'/);
  assert.ok(
    branch.indexOf('retention_offer_used_at: now.toISOString()') < branch.indexOf("kind: 'offer_switch_pro'"),
    'the claim comes before the log',
  );
  // Discount and pause keep the Stripe context.
  assert.match(src, /const ctx = await subscriptionContext\(req\)/);
});

test('store context: reads the columns the webhook writes, and never Stripe', () => {
  const lib = readFileSync(new URL('./route.ts', import.meta.url), 'utf8');
  assert.match(
    lib,
    /select\('access_tier, plan, billing_source, subscription_status, retention_offer_used_at, cancel_at_period_end, paused_until'\)/,
  );
  const fn = lib.slice(lib.indexOf('export async function storeOfferContext'));
  assert.doesNotMatch(fn, /getStripe|findLiveSubscription|stripe_customer_id/);
  // Same gate as the Stripe context: session first, then the write rate limit.
  assert.match(fn, /supabase\.auth\.getUser\(\)/);
  assert.match(fn, /rateLimit\('subscription_write'/);
  assert.match(fn, /access_tier === 'founder'/);
});

test('store profile: the live status is the tier the store webhook writes, not the Stripe column', async () => {
  // Null Stripe status (the real store profile) still takes the offer.
  const { deps, order } = run();
  assert.deepEqual(await takeSwitchProOffer(deps), { ok: true });
  assert.deepEqual(order, ['claim', 'log']);

  // A stale Stripe status from an old web subscription changes nothing.
  for (const stale of ['canceled', 'active', 'past_due']) {
    const r = run({ profile: { ...STORE_PLUS, subscription_status: stale } });
    assert.deepEqual(await takeSwitchProOffer(r.deps), { ok: true }, stale);
  }

  // The store saying past_due or canceled refuses, whatever Stripe once said.
  for (const tier of ['past_due', 'canceled']) {
    const r = run({ profile: { ...STORE_PLUS, access_tier: tier, subscription_status: 'active' } });
    const out = await takeSwitchProOffer(r.deps);
    assert.equal(out.ok, false, tier);
    assert.deepEqual(r.order, [], tier);
  }

  assert.equal(offerStatusFor({ access_tier: 'trialing', billing_source: 'play_store', subscription_status: null }), 'trialing');
  // A Stripe (or unset) source still reads the Stripe column, as before.
  assert.equal(offerStatusFor({ access_tier: 'active', billing_source: 'stripe', subscription_status: 'trialing' }), 'trialing');
  assert.equal(offerStatusFor({ access_tier: 'active', billing_source: null, subscription_status: null }), 'canceled');
});
