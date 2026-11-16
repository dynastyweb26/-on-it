import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newLinkAllowed } from './plan';

// The new-link gate: free, pro, plus and founder, with the tiers flag on and
// off. Update mode never asks this function — a connected bank keeps working —
// which the route test proves (src/lib/tiers-gates.test.ts).
const CASES: Array<[string, string | null, boolean]> = [
  // tier, plan, plus?
  ['free', null, false],
  ['free', 'pro', false],
  ['free', 'plus', false],
  ['canceled', 'plus', false],
  ['standard', null, false],
  ['trialing', null, false], // a paid tier with no plan is Pro, not Plus
  ['trialing', 'pro', false],
  ['active', 'pro', false],
  ['past_due', 'pro', false],
  ['trialing', 'plus', true],
  ['active', 'plus', true],
  ['past_due', 'plus', true],
  ['founder', null, true],
  ['founder', 'pro', true],
  ['founder', 'plus', true],
];

test('plaid plan gate: with tiers on, only Plus may link a new bank', () => {
  for (const [tier, plan, allowed] of CASES) {
    assert.equal(newLinkAllowed(true, tier, plan), allowed, `${tier}/${String(plan)}`);
  }
});

test('plaid plan gate: with tiers off, every plan may link (today’s behaviour)', () => {
  for (const [tier, plan] of CASES) {
    assert.equal(newLinkAllowed(false, tier, plan), true, `${tier}/${String(plan)}`);
  }
  assert.equal(newLinkAllowed(false, null, null), true);
  assert.equal(newLinkAllowed(false, 'garbage', 'garbage'), true);
});

test('plaid plan gate: an unknown pair is refused, never allowed by accident', () => {
  assert.equal(newLinkAllowed(true, null, null), false);
  assert.equal(newLinkAllowed(true, '', ''), false);
  assert.equal(newLinkAllowed(true, 'enterprise', 'plus'), false);
});
