import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dwellMs, enqueueIds, stackStep, swipeOutcome } from './toast-queue';

test('dwell: signed and overdue 8s, money 5s, views 4s', () => {
  assert.equal(dwellMs('estimate_signed', 'success', true), 8000);
  assert.equal(dwellMs('invoice_overdue', 'overdue', false), 8000);
  assert.equal(dwellMs('payment_recorded', 'gold', false), 5000);
  assert.equal(dwellMs('estimate_viewed', 'neutral', false), 4000);
});

test('swipe: 32px or 500px/s dismisses, 96px clears, less does nothing', () => {
  assert.equal(swipeOutcome(-31, 1000), 'none');
  assert.equal(swipeOutcome(-32, 1000), 'dismiss');
  assert.equal(swipeOutcome(-20, 30), 'dismiss'); // 0.67px/ms flick
  assert.equal(swipeOutcome(-95, 1000), 'dismiss');
  assert.equal(swipeOutcome(-96, 1000), 'clear');
  assert.equal(swipeOutcome(40, 100), 'none');
  assert.equal(swipeOutcome(-10, 0), 'dismiss'); // zero duration cannot divide by zero
});

test('back cards step to .94/.88, y 12/22, opacity .9/.75', () => {
  assert.deepEqual(stackStep(0), { scale: 1, y: 0, opacity: 1 });
  assert.deepEqual(stackStep(1), { scale: 0.94, y: 12, opacity: 0.9 });
  assert.deepEqual(stackStep(2), { scale: 0.88, y: 22, opacity: 0.75 });
});

test('the queue holds three, skips repeats and drops the oldest', () => {
  const q = enqueueIds([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }, { id: 'd' }]);
  assert.deepEqual(q.map((x) => x.id), ['b', 'c', 'd']);
});
