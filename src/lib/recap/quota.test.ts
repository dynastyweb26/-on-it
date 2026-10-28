import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FREE_RECAPS, freeRecapsLeft, freeRecapsUsed, isEntitledSlot, nextFreeSlot, recapUnlocked,
} from './quota';

const free = (slot: number | null) => ({ kind: 'week' as const, free_plan: true, free_slot: slot });
const paid = (slot: number | null = null) => ({ kind: 'week' as const, free_plan: false, free_slot: slot });

test('two free weekly recaps', () => {
  assert.equal(FREE_RECAPS, 2);
  assert.equal(freeRecapsLeft([]), 2);
  assert.equal(freeRecapsLeft([free(1)]), 1);
  assert.equal(freeRecapsLeft([free(1), free(2)]), 0);
  assert.equal(freeRecapsLeft([free(1), free(2), free(null)]), 0, 'a locked row never refunds a slot');
  assert.equal(freeRecapsLeft([free(1), free(2), paid()]), 0, 'paid history is not part of the allowance');
});

test('a quiet period does not spend a slot', () => {
  assert.equal(nextFreeSlot({ kind: 'week', announce: false, freePlan: true, used: 0 }), null);
  assert.equal(nextFreeSlot({ kind: 'week', announce: false, freePlan: true, used: 1 }), null);
  // …and the row it leaves behind is not counted later either.
  assert.equal(freeRecapsUsed([free(null)]), 0);
});

test('monthly recaps never take a slot', () => {
  assert.equal(nextFreeSlot({ kind: 'month', announce: true, freePlan: true, used: 0 }), null);
  assert.equal(nextFreeSlot({ kind: 'month', announce: true, freePlan: false, used: 0 }), null);
});

test('slots are assigned in order and stop at the cap', () => {
  assert.equal(nextFreeSlot({ kind: 'week', announce: true, freePlan: true, used: 0 }), 1);
  assert.equal(nextFreeSlot({ kind: 'week', announce: true, freePlan: true, used: 1 }), 2);
  assert.equal(nextFreeSlot({ kind: 'week', announce: true, freePlan: true, used: 2 }), null);
  assert.equal(nextFreeSlot({ kind: 'week', announce: true, freePlan: false, used: 0 }), null);
});

test('the third free recap is born locked, the first two play', () => {
  assert.equal(recapUnlocked(free(1)), true);
  assert.equal(recapUnlocked(free(2)), true);
  assert.equal(recapUnlocked(free(null)), false);
  assert.equal(recapUnlocked(free(3 as number)), false, 'out of range is not a slot');
});

test('paid-built rows always play, including after a downgrade', () => {
  assert.equal(recapUnlocked(paid()), true);
  assert.equal(recapUnlocked(paid(null)), true);
  assert.equal(recapUnlocked({ kind: 'month', free_plan: null, free_slot: null }), true, 'pre-rule rows play');
  // A downgraded owner has paid rows + the two free ones; everything plays.
  const rows = [paid(), paid(), free(1), free(2)];
  assert.ok(rows.every(recapUnlocked));
  assert.equal(freeRecapsLeft(rows), 0);
});

test('slots are validated, not trusted', () => {
  assert.equal(isEntitledSlot(1), true);
  assert.equal(isEntitledSlot(2), true);
  assert.equal(isEntitledSlot(0), false);
  assert.equal(isEntitledSlot(3), false);
  assert.equal(isEntitledSlot(1.5), false);
  assert.equal(isEntitledSlot(null), false);
  assert.equal(isEntitledSlot(undefined), false);
});
