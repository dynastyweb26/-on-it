import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeLineChanges, updatedNotice } from './change-note';

const money = (n: number) => `$${n.toFixed(2)}`;
const hr = (qty: number, price = 50) => ({ description: 'Therapy Sessions', qty, unit: 'hour', unit_price: price });

test('a quantity change reads as the design does', () => {
  assert.equal(describeLineChanges([hr(1)], [hr(2)], money), 'Therapy Sessions: 1 hr → 2 hr');
});
test('a price change shows both prices', () => {
  assert.equal(describeLineChanges([hr(1, 50)], [hr(1, 60)], money), 'Therapy Sessions: $50.00 → $60.00');
});
test('added and removed lines are named; several changes collapse', () => {
  assert.equal(describeLineChanges([hr(1)], [hr(1), { description: 'Travel', qty: 1, unit_price: 10 }], money), 'Travel: added');
  assert.equal(describeLineChanges([hr(1), hr(1)], [hr(1)], money), 'Therapy Sessions: removed');
  assert.equal(
    describeLineChanges([hr(1), hr(1), hr(1)], [hr(2), hr(3), hr(4)], money),
    'Therapy Sessions: 1 hr → 2 hr, and 2 more changes',
  );
});
test('nothing to say when no line differs', () => {
  assert.equal(describeLineChanges([hr(1)], [hr(1)], money), null);
});
test('the notice is the design sentence, with the business name and no pronoun', () => {
  const n = updatedNotice('Cyril Handyman & Door LLC', 50, 100, 'Therapy Sessions: 1 hr → 2 hr', money);
  assert.equal(n.lead, 'Cyril Handyman & Door LLC updated this estimate.');
  assert.equal(n.bold, 'Total changed from $50.00 to $100.00');
  assert.equal(n.tail, '(Therapy Sessions: 1 hr → 2 hr).');
  assert.deepEqual(updatedNotice('Acme', 100, 100, null, money), { lead: 'Acme updated this estimate.', bold: null, tail: null });
});
