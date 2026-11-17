import { test } from 'node:test';
import assert from 'node:assert/strict';

import { paywallEntryFor, type PaywallEntry } from './paywall-entry';

// Every entry point the app can open a wall from (the union, spelled out so a
// new one cannot be added without a line here).
const ALL: readonly PaywallEntry[] = [
  'invoice', 'estimate', 'expense',
  'recurring', 'photos', 'bank',
  'pdfs', 'recaps',
  'ai-limit',
  'winback',
  'soft-usage-invoice', 'soft-usage-estimate', 'soft-estimate-approved',
  'soft-first-payment', 'soft-winback',
];

test('entry map: a free limit preselects Pro', () => {
  for (const entry of ['invoice', 'estimate', 'expense', 'pdfs', 'recaps', 'winback'] as const) {
    const target = paywallEntryFor(entry, 'free');
    assert.ok(target, entry);
    assert.equal(target.plan, 'pro', entry);
  }
  assert.deepEqual(paywallEntryFor('invoice', 'free'), { plan: 'pro', topLineKey: 'limit.invoice' });
  assert.deepEqual(paywallEntryFor('estimate', 'free'), { plan: 'pro', topLineKey: 'limit.estimate' });
  assert.deepEqual(paywallEntryFor('expense', 'free'), { plan: 'pro', topLineKey: 'limit.expense' });
  assert.deepEqual(paywallEntryFor('pdfs', 'free'), { plan: 'pro', topLineKey: 'reports' });
  assert.deepEqual(paywallEntryFor('recaps', 'free'), { plan: 'pro', topLineKey: 'recaps' });
  assert.deepEqual(paywallEntryFor('winback', 'free'), { plan: 'pro', topLineKey: 'winback' });
});

test('entry map: a Plus lock preselects Plus', () => {
  for (const entry of ['recurring', 'photos', 'bank'] as const) {
    const target = paywallEntryFor(entry, 'free');
    assert.ok(target, entry);
    assert.equal(target.plan, 'plus', entry);
    assert.equal(target.topLineKey, `lock.${entry}`, entry);
  }
});

test('entry map: a Pro user at a Plus lock gets the Move up to Plus variant', () => {
  assert.deepEqual(paywallEntryFor('bank', 'pro'), { plan: 'plus', topLineKey: 'lock.bank.moveUp' });
  assert.deepEqual(paywallEntryFor('recurring', 'pro'), { plan: 'plus', topLineKey: 'lock.recurring.moveUp' });
  assert.deepEqual(paywallEntryFor('photos', 'pro'), { plan: 'plus', topLineKey: 'lock.photos.moveUp' });
});

test('entry map: a Plus user has nothing to buy at a Plus lock', () => {
  for (const entry of ['recurring', 'photos', 'bank'] as const) {
    assert.equal(paywallEntryFor(entry, 'plus'), null, entry);
  }
});

test('entry map: the AI limit — Free buys Pro, Pro buys Plus, Plus has no row', () => {
  assert.deepEqual(paywallEntryFor('ai-limit', 'free'), { plan: 'pro', topLineKey: 'ai.limit.free' });
  assert.deepEqual(paywallEntryFor('ai-limit', 'pro'), { plan: 'plus', topLineKey: 'ai.limit.pro' });
  assert.equal(paywallEntryFor('ai-limit', 'plus'), null);
});

test('entry map: every soft prompt opens a wall with its own top line', () => {
  const expected = {
    'soft-usage-invoice': 'soft.usage.invoice',
    'soft-usage-estimate': 'soft.usage.estimate',
    'soft-estimate-approved': 'soft.estimate-approved',
    'soft-first-payment': 'soft.first-payment',
    'soft-winback': 'soft.winback',
  } as const;
  for (const [entry, key] of Object.entries(expected)) {
    assert.deepEqual(paywallEntryFor(entry as PaywallEntry, 'free'), { plan: 'pro', topLineKey: key }, entry);
  }
});

test('entry map: every entry point answers for a free user, no plan guessed', () => {
  for (const entry of ALL) {
    const target = paywallEntryFor(entry, 'free');
    assert.ok(target, `${entry} must map for a free user`);
    assert.ok(['pro', 'plus'].includes(target.plan), entry);
    assert.ok(target.topLineKey.length > 0, entry);
  }
});

test('entry map: a Plus viewer is only ever offered a free-plan limit', () => {
  for (const entry of ALL) {
    const target = paywallEntryFor(entry, 'plus');
    if (!target) continue;
    assert.equal(target.plan, 'pro', `${entry} must not try to sell Plus to a Plus user`);
  }
});
