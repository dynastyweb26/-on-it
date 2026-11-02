// The Stripe payout detector: one whole word, both descriptors, fail closed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STRIPE_PAYOUT_NOTE, depositLinkRefusal, isStripePayout, notIncomeKind,
} from './payouts';

test('the whole word STRIPE in either descriptor is the only signal', () => {
  assert.equal(isStripePayout('STRIPE TRANSFER', null), true);
  assert.equal(isStripePayout(null, 'Stripe'), true);
  assert.equal(isStripePayout('stripe payout 1234'), true);
  assert.equal(isStripePayout('STRIPE PAYMENTS'), true);
  // Not a prefix or a plural: a shirt shop is not a payout.
  assert.equal(isStripePayout('Striped Shirt Co'), false);
  assert.equal(isStripePayout('STRIPES LLC'), false);
  assert.equal(isStripePayout('ZELLE FROM MIKE', ''), false);
  assert.equal(isStripePayout(null, undefined), false);
});

test('a payout can never take a ledger row, and the stored flag is not trusted alone', () => {
  // The descriptor is re-read: a stale flag cannot let one through.
  assert.equal(depositLinkRefusal({ is_stripe_payout: false, name: 'STRIPE TRANSFER' }), 'stripe_payout');
  // And the flag refuses even when the descriptor was rewritten.
  assert.equal(depositLinkRefusal({ is_stripe_payout: true, name: 'ZELLE' }), 'stripe_payout');
  assert.equal(
    depositLinkRefusal({ name: 'STRIPE TRANSFER', removed_at: '2026-10-31T00:00:00.000Z' }),
    'stripe_payout',
  );
  // A removed deposit is refused too; the ledger is never reversed from here.
  assert.equal(depositLinkRefusal({ name: 'ZELLE', removed_at: '2026-10-31T00:00:00.000Z' }), 'removed');
  assert.equal(depositLinkRefusal({ name: 'ZELLE', merchant_name: 'Mike Davis' }), null);
});

test('not income stores stripe_payout for a payout so the reason survives', () => {
  assert.equal(notIncomeKind({ name: 'STRIPE TRANSFER' }), 'stripe_payout');
  assert.equal(notIncomeKind({ is_stripe_payout: true, name: 'ZELLE' }), 'stripe_payout');
  assert.equal(notIncomeKind({ name: 'ZELLE FROM MIKE' }), 'not_income');
});

test('the notice copy is the exact sentence the card shows', () => {
  assert.equal(
    STRIPE_PAYOUT_NOTE,
    "Looks like a Stripe payout. Those pay out money already counted, so it's not new income.",
  );
});
