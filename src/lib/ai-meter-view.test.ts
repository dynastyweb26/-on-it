// design/tiers 02 (AI meter) and 03 (AI limit card): the pure decisions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aiPaywallReason,
  limitCardCollapsed,
  meterLine,
  monthlyPrice,
  nextMeter,
  tiersFromAccess,
  upgradeFor,
  usedAllLine,
  LIMIT_COPY,
} from './ai-meter-view';
import { PLAN_CATALOG } from './plan-catalog';
import { PLAN_NAMES } from './entitlements';

const NOW = new Date('2026-11-16T18:00:00Z');
const RESET = '2026-11-17T06:00:00.000Z';
const m = (used: number, limit: number) => ({ used, limit, resetsAt: RESET });

test('meter: hidden at 4 or more left', () => {
  assert.equal(meterLine(m(0, 5), NOW), null);
  assert.equal(meterLine(m(1, 5), NOW), null);
  assert.equal(meterLine(m(26, 30), NOW), null);
});

test('meter: first shows at 3 left, on every plan', () => {
  assert.equal(meterLine(m(2, 5), NOW)?.text, '3 of 5 left today');
  assert.equal(meterLine(m(27, 30), NOW)?.text, '3 of 30 left today');
  assert.equal(meterLine(m(97, 100), NOW)?.text, '3 of 100 left today');
});

test('meter: 2 left reads and announces as the board says', () => {
  const l = meterLine(m(3, 5), NOW);
  assert.equal(l?.text, '2 of 5 left today');
  assert.equal(l?.announce, '2 questions left today');
  assert.equal(l?.last, false);
});

test('meter: 1 left is the gold line, singular announcement', () => {
  const l = meterLine(m(4, 5), NOW);
  assert.equal(l?.text, '1 of 5 left today');
  assert.equal(l?.announce, '1 question left today');
  assert.equal(l?.last, true);
});

test('meter: hidden at 0 (the limit card takes its place) and past the limit', () => {
  assert.equal(meterLine(m(5, 5), NOW), null);
  assert.equal(meterLine(m(9, 5), NOW), null);
});

test('meter: hidden once the day has reset, and with no numbers', () => {
  assert.equal(meterLine(m(4, 5), new Date(RESET)), null);
  assert.equal(meterLine(null, NOW), null);
});

test('nextMeter: an answer carries the new count, a refusal the spent one, others keep it', () => {
  const prev = m(2, 5);
  assert.deepEqual(nextMeter(prev, { kind: 'ok', ai: m(3, 5) }), m(3, 5));
  assert.deepEqual(nextMeter(prev, { kind: 'ok' }), prev);
  assert.deepEqual(nextMeter(prev, { kind: 'limit', used: 5, limit: 5, resetsAt: RESET }), m(5, 5));
  assert.deepEqual(nextMeter(prev, { kind: 'network' }), prev);
  assert.equal(nextMeter(null, { kind: 'error' }), null);
});

test('limit card: copy is the board’s', () => {
  assert.equal(LIMIT_COPY.title, 'That’s today’s questions');
  assert.equal(usedAllLine(5), 'You’ve used all 5 questions for today.');
  assert.equal(LIMIT_COPY.reset, 'Back at midnight');
  assert.equal(LIMIT_COPY.plusMenu, 'You can still create invoices, estimates and expenses with +');
});

test('upgrade row: Free sees Pro, from the catalog', () => {
  const pro = PLAN_CATALOG.plans.find((p) => p.plan === 'pro')!;
  assert.deepEqual(upgradeFor('free', PLAN_CATALOG), {
    plan: 'pro',
    label: `${pro.name} gives you ${pro.limits.aiDailyLimit} a day`,
    price: monthlyPrice(pro.monthlyCents!),
    cta: `See ${pro.name}`,
  });
});

test('upgrade row: Pro is offered Plus, worded as an upgrade', () => {
  const row = upgradeFor('pro', PLAN_CATALOG);
  assert.equal(row?.plan, 'plus');
  assert.equal(row?.cta, `Upgrade to ${PLAN_NAMES.plus}`);
  assert.match(row?.label ?? '', /gives you 100 a day$/);
});

test('upgrade row: none on Plus, without a plan, or without a catalog', () => {
  assert.equal(upgradeFor('plus', PLAN_CATALOG), null);
  assert.equal(upgradeFor(null, PLAN_CATALOG), null);
  assert.equal(upgradeFor('free', null), null);
});

test('monthlyPrice formats whole cents', () => {
  assert.equal(monthlyPrice(999), '$9.99/mo');
  assert.equal(monthlyPrice(1699), '$16.99/mo');
  assert.equal(monthlyPrice(1000), '$10.00/mo');
});

test('a second card on the same day is collapsed; a new day is full again', () => {
  const thread = [{}, { aiLimit: { resetsAt: RESET } }];
  assert.equal(limitCardCollapsed(thread, RESET), true);
  assert.equal(limitCardCollapsed(thread, '2026-11-18T06:00:00.000Z'), false);
  assert.equal(limitCardCollapsed([], RESET), false);
});

test('paywall reason follows the drawn pattern', () => {
  assert.equal(aiPaywallReason('Free', 5), 'Free includes 5 AI questions a day. You’ve used them.');
});

test('tiersFromAccess: reads the flag-on fields', () => {
  const t = tiersFromAccess({ aiUsedToday: 3, aiLimit: 5, aiResetsAt: RESET, entitlements: { plan: 'free' }, planCatalog: PLAN_CATALOG });
  assert.deepEqual(t.meter, m(3, 5));
  assert.equal(t.plan, 'free');
  assert.equal(t.catalog, PLAN_CATALOG);
});

test('tiersFromAccess: flag-off or malformed bodies read as absent', () => {
  assert.deepEqual(tiersFromAccess({ tier: 'free' }), { meter: null, plan: null, catalog: null });
  assert.deepEqual(tiersFromAccess(null), { meter: null, plan: null, catalog: null });
  assert.equal(tiersFromAccess({ aiUsedToday: -1, aiLimit: 5, aiResetsAt: RESET }).meter, null);
  assert.equal(tiersFromAccess({ entitlements: { plan: 'gold' } }).plan, null);
});
