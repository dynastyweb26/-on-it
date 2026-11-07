import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guardReplyFigures, ungroundedFigures } from './reply-guard';

// Cyril, Nov 7 2026: items after the model's rewrite.
const CYRIL = {
  items: [
    { qty: 3150, unit_price: 2 },
    { qty: 1, unit_price: 800 },
    { qty: 1, unit_price: 3700 },
  ],
  total: 10800,
};

test('drops the claim that the target total was reached when it was not', () => {
  const reply = 'Got it. Back to 3150 square feet for the flooring. I adjusted the trash removal to make your total 7500. Anything else?';
  assert.equal(
    guardReplyFigures(reply, CYRIL),
    'Got it. Back to 3150 square feet for the flooring. Anything else?',
  );
});

test('keeps a figure that matches the real total, a qty, a price or a line amount', () => {
  const reply = 'Flooring is 3150 square feet at 2 per square foot, 6300 for that line. Trash removal is 3700. Total is 10800.';
  assert.equal(guardReplyFigures(reply, CYRIL), reply);
});

test('leaves figures under 100 alone', () => {
  const reply = 'Added 3 blinds. Step 2 is the address.';
  assert.equal(guardReplyFigures(reply, { items: [], total: 0 }), reply);
});

test('the user-stated target is not an allowed source', () => {
  assert.deepEqual(ungroundedFigures('Your total is now 7500.', new Set([10800])), [7500]);
});

test('accepts comma and decimal forms of an allowed figure', () => {
  const facts = { items: [{ qty: 1, unit_price: 1500 }], total: 1500 };
  assert.equal(guardReplyFigures('Total is 1,500.00 for the fence.', facts), 'Total is 1,500.00 for the fence.');
});

test('keeps a contact echo: phone, street number and zip digit groups are allowed', () => {
  const facts = {
    items: [{ qty: 1, unit_price: 50 }],
    total: 50,
    contact: ['945-344-4550', '2407 Neff Lane, Forney, TX 75126'],
  };
  const reply = 'Car wash for Brandon (945-344-4550), 2407 Neff Lane, Forney, TX 75126.';
  assert.equal(guardReplyFigures(reply, facts), reply);
});

test('does not treat dates as money', () => {
  const reply = 'Due 2026-11-21, or 11/21/2026 if you prefer.';
  assert.equal(guardReplyFigures(reply, { items: [], total: 0 }), reply);
});

test('priceless items and tax amounts do not break the allowed set', () => {
  const facts = {
    items: [{ qty: 1, unit_price: null }, { qty: 2, unit_price: 500 }],
    total: 1080,
    subtotal: 1000,
    taxAmount: 80,
    taxRate: 8,
  };
  assert.equal(
    guardReplyFigures('Subtotal 1000, tax 80, total 1080.', facts),
    'Subtotal 1000, tax 80, total 1080.',
  );
});

test('an empty result stays empty so the route can fall back to the money sentence', () => {
  assert.equal(guardReplyFigures('Your total is 7500.', CYRIL), '');
});

// Preview run, Nov 7 2026 (screenshots): the model spelled the total out in words
// and got it wrong while the card said $5,900.
const PREVIEW_1 = { items: [{ qty: 2550, unit_price: 2 }, { qty: 1, unit_price: 800 }], total: 5900 };
const PREVIEW_2 = { items: [{ qty: 2550, unit_price: 1.96 }, { qty: 1, unit_price: 800 }], total: 5798 };

test('drops a spelled-out total that contradicts the card, keeps a spelled-out qty that matches', () => {
  assert.equal(
    guardReplyFigures(
      'Reduced the flooring to twenty five hundred fifty square feet. New total is six thousand one hundred. Ready to send?',
      PREVIEW_1,
    ),
    'Reduced the flooring to twenty five hundred fifty square feet. Ready to send?',
  );
});

test('drops "sixty thousand nine hundred" against a 5,798 total', () => {
  assert.equal(
    guardReplyFigures('Reduced the first item by one hundred. New total is sixty thousand nine hundred. Ready to send?', PREVIEW_2),
    'Ready to send?',
  );
});

test('keeps a spelled-out total that matches the card', () => {
  const reply = 'New total is five thousand nine hundred. Ready to send?';
  assert.equal(guardReplyFigures(reply, PREVIEW_1), reply);
});
