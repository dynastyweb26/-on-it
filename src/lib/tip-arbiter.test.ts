import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickTip, TIP_PRIORITY, type TipEligibility } from './tip-arbiter';

// The full priority matrix: every combination of the four eligibility flags
// picks the first eligible kind in priority order, and only one.
test('every eligibility combination picks exactly the highest-priority tip', () => {
  for (let mask = 0; mask < 1 << TIP_PRIORITY.length; mask++) {
    const eligible: TipEligibility = {};
    TIP_PRIORITY.forEach((tip, i) => { eligible[tip] = Boolean(mask & (1 << i)); });
    const expected = TIP_PRIORITY.find((tip) => eligible[tip]) ?? null;
    assert.equal(pickTip(eligible), expected, `mask ${mask.toString(2).padStart(4, '0')}`);
  }
});

test('priority order is terms > payouts > alerts > feedback', () => {
  assert.equal(pickTip({ terms: true, payouts: true, alerts: true, feedback: true }), 'terms');
  assert.equal(pickTip({ payouts: true, alerts: true, feedback: true }), 'payouts');
  assert.equal(pickTip({ alerts: true, feedback: true }), 'alerts');
  assert.equal(pickTip({ feedback: true }), 'feedback');
});

test('nothing eligible means no card', () => {
  assert.equal(pickTip({}), null);
  assert.equal(pickTip({ terms: false, payouts: false, alerts: false, feedback: false }), null);
  assert.equal(pickTip({ terms: undefined, feedback: undefined }), null);
  assert.equal(pickTip(null), null);
  assert.equal(pickTip(undefined), null);
});

test('truthy-but-not-true is not eligible (no accidental cards)', () => {
  // The flags come from rules that must return real booleans; anything else is
  // treated as "not eligible" so an undefined rule can't show a card.
  assert.equal(pickTip({ alerts: 1 as unknown as boolean }), null);
  assert.equal(pickTip({ feedback: 'yes' as unknown as boolean }), null);
});
