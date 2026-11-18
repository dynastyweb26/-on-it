// design/tiers 07 (cancel flow, two-plan additions): the pure wording.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plusOfferCards, plusOfferCta, plusPriceStep, plusSeasonalSwitch, seasonalSwitchCard, switchedLine } from './cancel-plus-view';
import { cancelOffersFor } from './subscription/offers';
import { PLAN_CATALOG } from './plan-catalog';
import { usd } from './plan-lock-view';

const RENEW = '2026-12-15T12:00:00Z';
const pro = PLAN_CATALOG.plans.find((p) => p.plan === 'pro')!;
const r = PLAN_CATALOG.retentionOffer;

test('7A: a Plus user who picks Too expensive gets the two offers; Pro keeps the discount alone', () => {
  const plus = cancelOffersFor({ plan: 'plus', reason: 'price', trialing: false, eligible: true });
  assert.equal(plusPriceStep(plus), true);
  assert.equal(plusPriceStep(cancelOffersFor({ plan: 'pro', reason: 'price', trialing: false, eligible: true })), false);
  assert.equal(plusPriceStep(cancelOffersFor({ plan: 'plus', reason: 'price', trialing: false, eligible: false })), false);
});

test('7B: Slow season where the store cannot pause is the Pro switch; elsewhere pause stays', () => {
  assert.equal(plusSeasonalSwitch(cancelOffersFor({ plan: 'plus', reason: 'seasonal', trialing: false, billingSource: 'app_store', eligible: true })), true);
  assert.equal(plusSeasonalSwitch(cancelOffersFor({ plan: 'plus', reason: 'seasonal', trialing: false, billingSource: 'play_store', eligible: true })), false);
});

test('the cards: Switch to Pro first, the 50% price from the catalog’s retention offer', () => {
  const [sw, off] = plusOfferCards(PLAN_CATALOG, RENEW);
  assert.deepEqual([sw.kind, sw.title, sw.price, sw.per], ['switch_pro', `Switch to ${pro.name}`, usd(pro.monthlyCents!), '/mo from Dec 15']);
  assert.deepEqual([off.kind, off.title, off.price, off.per], ['discount', `${r.percentOff}% off your next ${r.months} months`, usd(r.monthlyCents), `/mo, then ${usd(r.thenCents)}`]);
  assert.equal(off.price, '$8.49', 'the store’s fixed price, not a computed half');
});

test('the CTA follows the selection; success and 7B lines', () => {
  assert.equal(plusOfferCta('switch_pro', PLAN_CATALOG), `Switch to ${pro.name}`);
  assert.equal(plusOfferCta('discount', PLAN_CATALOG), `Take ${r.percentOff}% off`);
  assert.equal(switchedLine(PLAN_CATALOG, RENEW), `You’re set. ${pro.name} starts Dec 15.`);
  assert.deepEqual(seasonalSwitchCard(PLAN_CATALOG, RENEW), {
    title: `Drop to ${pro.name} for the quiet months`,
    body: `${usd(pro.monthlyCents!)}/mo from Dec 15. Move back to Plus any time, it opens right away.`,
  });
});
