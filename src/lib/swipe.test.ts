import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AXIS_SLOP_PX, HORIZONTAL_RATIO, classifyAxis, isFlick } from './swipe';

test('classifyAxis: waits for the 12px slop', () => {
  assert.equal(classifyAxis(0, 0), 'pending');
  assert.equal(classifyAxis(11, 0), 'pending');
  assert.equal(classifyAxis(-11, 0), 'pending');
  assert.equal(classifyAxis(8, 8), 'pending'); // 11.3px total
  assert.equal(classifyAxis(12, 0), 'horizontal'); // exactly the slop
  assert.equal(classifyAxis(0, 12), 'vertical');
});

test('classifyAxis: horizontal only inside the 2.5 ratio cone', () => {
  assert.equal(classifyAxis(25, 10), 'horizontal'); // exactly 2.5
  assert.equal(classifyAxis(-25, 10), 'horizontal');
  assert.equal(classifyAxis(-25, -10), 'horizontal');
  assert.equal(classifyAxis(24.9, 10), 'vertical');
  assert.equal(classifyAxis(120, 48), 'horizontal'); // 120 / 48 = 2.5
  assert.equal(classifyAxis(120, 48.1), 'vertical');
});

test('classifyAxis: custom slop and ratio', () => {
  assert.equal(classifyAxis(5, 0, { slop: 4 }), 'horizontal');
  assert.equal(classifyAxis(3, 0, { slop: 4 }), 'pending');
  assert.equal(classifyAxis(6, 3, { slop: 4, ratio: 3 }), 'vertical');
  assert.equal(classifyAxis(9, 3, { slop: 4, ratio: 3 }), 'horizontal');
});

test('classifyAxis: exported defaults match the audited thresholds', () => {
  assert.equal(AXIS_SLOP_PX, 12);
  assert.equal(HORIZONTAL_RATIO, 2.5);
});

test('isFlick: 90px at 1.1 px/ms for tab navigation', () => {
  const tab = { minDistance: 90, minVelocity: 1.1 };
  assert.ok(isFlick(-90, 81, tab)); // 1.111 px/ms
  assert.ok(!isFlick(90, 82, tab)); // 1.0975 px/ms
  assert.ok(isFlick(-90, 81.8181818, tab)); // ~1.1 px/ms
  assert.ok(isFlick(110, 100, tab)); // exactly 1.1 px/ms
  assert.ok(!isFlick(89, 1, tab)); // fast but below 90px
  assert.ok(!isFlick(90, 1000, tab)); // far enough, far too slow
  assert.ok(!isFlick(90, 0, tab));
  assert.ok(!isFlick(90, -1, tab));
  assert.ok(!isFlick(Number.NaN, 10, tab));
});

test('isFlick: 56px at 1.0 px/ms for swipe-to-open rows', () => {
  const row = { minDistance: 56, minVelocity: 1 };
  assert.ok(isFlick(-56, 56, row)); // exactly the thresholds
  assert.ok(!isFlick(-56, 57, row)); // 0.98 px/ms
  assert.ok(!isFlick(-55.9, 1, row)); // fast but below 56px
  assert.ok(isFlick(-120, 80, row)); // 1.5 px/ms
  assert.ok(!isFlick(-120, 200, row)); // 0.6 px/ms
});

test('isFlick: total distance is separate from the recent speed window', () => {
  const tab = { minDistance: 90, minVelocity: 1.1, distance: 120 };
  // A long slow drag: 120px total, but only 8px in the last 90ms.
  assert.ok(!isFlick(8, 90, tab));
  // A deliberate flick at the end of the same drag: 60px in the last 50ms.
  assert.ok(isFlick(60, 50, tab));
  // The distance gate still uses the whole gesture, not the recent slice.
  assert.ok(!isFlick(60, 50, { ...tab, distance: 89 }));
});
