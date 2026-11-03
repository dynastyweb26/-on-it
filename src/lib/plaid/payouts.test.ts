// The Stripe payout detector: one whole word, both descriptors, fail closed —
// and no invented certainty. A descriptor is not proof, so every STRIPE deposit
// is ambiguous until On It holds a payout record.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STRIPE_PAYOUT_CAUTION, STRIPE_PAYOUT_NOTE, depositLinkRefusal,
  isStripePayout, payoutNote, stripePayoutVerdict,
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

test('an ordinary deposit is not a payout at all', () => {
  assert.equal(stripePayoutVerdict({ name: 'ZELLE FROM MIKE' }), 'not_stripe');
  assert.equal(stripePayoutVerdict({ merchant_name: 'Mike Davis' }), 'not_stripe');
  assert.equal(stripePayoutVerdict({}), 'not_stripe');
});

test('every STRIPE descriptor is AMBIGUOUS: nothing here can prove a payout', () => {
  // The rule this round ships with. A descriptor says "might be", and there is
  // no stored payout record to compare an amount against, so no deposit is ever
  // auto-filed. All of these go to To review with the caution note.
  assert.equal(stripePayoutVerdict({ name: 'STRIPE TRANSFER' }), 'ambiguous');
  assert.equal(stripePayoutVerdict({ merchant_name: 'Stripe' }), 'ambiguous');
  assert.equal(stripePayoutVerdict({ name: 'stripe payout 1234' }), 'ambiguous');
  // The stored flag is honoured too, so a rewritten descriptor cannot hide one.
  assert.equal(stripePayoutVerdict({ is_stripe_payout: true, name: 'ZELLE' }), 'ambiguous');
});

test('there is no "sure" verdict to reach, by type or by value', () => {
  // A tight, self-documenting guard: the only values the function can return.
  const verdicts = new Set([
    stripePayoutVerdict({ name: 'STRIPE TRANSFER' }),
    stripePayoutVerdict({ name: 'ZELLE' }),
  ]);
  assert.deepEqual([...verdicts].sort(), ['ambiguous', 'not_stripe']);
  assert.equal(verdicts.has('sure' as never), false);
});

test('each verdict carries its own sentence, and an ordinary deposit gets none', () => {
  assert.equal(payoutNote('not_stripe'), null);
  assert.equal(payoutNote('ambiguous'), STRIPE_PAYOUT_CAUTION);
  assert.equal(
    STRIPE_PAYOUT_CAUTION,
    "This might be a Stripe payout. If it is, choose Don't add. Those card payments are already counted.",
  );
  // The old "it IS a payout" sentence is kept only for a stored stripe_payout
  // row, which nothing writes yet.
  assert.match(STRIPE_PAYOUT_NOTE, /not new income/);
});

test('a STRIPE deposit never takes a NEW payment, but may claim one already there', () => {
  // Recording a new payment from a lump of card money would count it twice, and
  // would be income from a payout if the descriptor is right.
  assert.equal(depositLinkRefusal({}, 'ambiguous', 'record'), 'stripe_payout');
  // Claiming the card payments the lump is made of is exactly the right answer.
  assert.equal(depositLinkRefusal({}, 'ambiguous', 'already'), null);

  // An ordinary deposit allows both.
  assert.equal(depositLinkRefusal({}, 'not_stripe', 'record'), null);
  assert.equal(depositLinkRefusal({}, 'not_stripe', 'already'), null);
});

test('a deposit the bank removed refuses everything: no ledger is reversed here', () => {
  const gone = { removed_at: '2026-10-31T00:00:00.000Z' };
  assert.equal(depositLinkRefusal(gone, 'not_stripe', 'record'), 'removed');
  assert.equal(depositLinkRefusal(gone, 'not_stripe', 'already'), 'removed');
  // The payout reason wins over removal: it is the more useful sentence.
  assert.equal(depositLinkRefusal(gone, 'ambiguous', 'record'), 'stripe_payout');
});
