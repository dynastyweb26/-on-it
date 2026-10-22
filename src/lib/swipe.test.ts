import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AXIS_SLOP_PX,
  EDGE_BAND_FACTOR,
  HORIZONTAL_RATIO,
  PAGE_DIM,
  PILL_STRETCH,
  SETTLE_MAX_MS,
  SETTLE_MIN_MS,
  TAB_FLICK,
  applyEdgeResistance,
  classifyAxis,
  dragFromLock,
  isFlick,
  pageDim,
  pillCentreAt,
  pillStretch,
  rubberBand,
  settleDuration,
  tabCommitDirection,
  tabProgress,
} from './swipe';

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

test('isFlick: total distance is separate from the recent speed window', () => {
  const tab = { minDistance: 90, minVelocity: 1.1, distance: 120 };
  // A long slow drag: 120px total, but only 8px in the last 90ms.
  assert.ok(!isFlick(8, 90, tab));
  // A deliberate flick at the end of the same drag: 60px in the last 50ms.
  assert.ok(isFlick(60, 50, tab));
  // The distance gate still uses the whole gesture, not the recent slice.
  assert.ok(!isFlick(60, 50, { ...tab, distance: 89 }));
});

test('rubberBand: 1:1 near zero, asymptote at 22% of width', () => {
  assert.equal(rubberBand(0, 400), 0);
  assert.equal(rubberBand(1, 400), 88 * (1 - 1 / ((1 / 88) * 0.55 + 1)));
  assert.ok(rubberBand(10, 400) > 0);
  assert.ok(rubberBand(10, 400) < 10);
  assert.ok(rubberBand(10_000, 400) < 88);
  assert.ok(rubberBand(1_000_000, 400) > 87.9);
  assert.ok(rubberBand(-1_000_000, 400) < -87.9);
  assert.equal(rubberBand(50, 0), 0);
  assert.equal(rubberBand(Number.NaN, 400), 0);
  assert.equal(EDGE_BAND_FACTOR, 0.22);
});

test('applyEdgeResistance: only outward at the first and last page', () => {
  assert.equal(applyEdgeResistance(40, 0, 5, 400), rubberBand(40, 400));
  assert.equal(applyEdgeResistance(-40, 0, 5, 400), -40);
  assert.equal(applyEdgeResistance(-40, 4, 5, 400), rubberBand(-40, 400));
  assert.equal(applyEdgeResistance(40, 4, 5, 400), 40);
  assert.equal(applyEdgeResistance(40, 2, 5, 400), 40);
  assert.equal(applyEdgeResistance(-40, 2, 5, 400), -40);
});

test('tabProgress: index minus offset/W, clamped to the deck', () => {
  assert.equal(tabProgress(2, 0, 400), 2);
  assert.equal(tabProgress(2, -200, 400), 2.5);
  assert.equal(tabProgress(2, 200, 400), 1.5);
  assert.equal(tabProgress(0, 200, 400), 0);
  assert.equal(tabProgress(4, -200, 400), 4);
  assert.equal(tabProgress(2, 0, 0), 2);
});

test('pageDim: 0 at the active page, 12% one page away', () => {
  assert.equal(pageDim(2, 2), 0);
  assert.equal(pageDim(2.5, 2), 0.06);
  assert.equal(pageDim(2.5, 3), 0.06);
  assert.equal(pageDim(1, 3), PAGE_DIM);
  assert.equal(pageDim(0, 4), PAGE_DIM);
});

test('dragFromLock: the lock point is the origin, not a fixed 12px', () => {
  // A fast first touchmove at 40px locks there: the track must not jump 28px.
  assert.equal(dragFromLock(40, 40), 0);
  assert.equal(dragFromLock(50, 40), 10);
  assert.equal(dragFromLock(30, 40), -10);
  // A slow lock at the slop behaves the same way.
  assert.equal(dragFromLock(12, 12), 0);
  assert.equal(dragFromLock(20, 12), 8);
  assert.equal(dragFromLock(Number.NaN, 12), -12);
});

test('settleDuration: 220–340ms from remaining distance and release speed', () => {
  assert.equal(SETTLE_MIN_MS, 220);
  assert.equal(SETTLE_MAX_MS, 340);
  assert.equal(settleDuration(0, 390, 0), SETTLE_MIN_MS);
  assert.equal(settleDuration(390, 390, 0), SETTLE_MAX_MS);
  assert.equal(settleDuration(10_000, 390, 0), SETTLE_MAX_MS);
  assert.equal(settleDuration(390, 390, 1.5), 250); // full travel, fast flick
  assert.ok(settleDuration(300, 390, 1.1) < settleDuration(300, 390, 0));
  assert.equal(settleDuration(100, 0, 0), 220); // bad/zero width falls back to minimum
  assert.ok(settleDuration(Number.NaN, 390, Number.NaN) >= SETTLE_MIN_MS);
  assert.ok(settleDuration(390, 390, 1.5) >= SETTLE_MIN_MS);
});

test('pillStretch: 1 at a tab centre, 1.32 halfway between', () => {
  assert.equal(pillStretch(0), 1);
  assert.equal(pillStretch(1), 1);
  assert.equal(pillStretch(2), 1);
  assert.equal(pillStretch(4), 1);
  assert.ok(Math.abs(pillStretch(2.5) - (1 + PILL_STRETCH)) < 1e-12);
  assert.ok(Math.abs(pillStretch(1.25) - (1 + PILL_STRETCH * Math.SQRT1_2)) < 1e-12);
});

test('tabCommitDirection: distance wins, then a matching flick', () => {
  assert.equal(tabCommitDirection(0, 400, 0, 0), 0);
  assert.equal(tabCommitDirection(-121, 400, 0, 0), 1); // > 30% of 400
  assert.equal(tabCommitDirection(121, 400, 0, 0), -1);
  assert.equal(tabCommitDirection(-120, 400, 0, 0), 0); // exactly 30% does not
  // A fast 90px flick commits even below the distance gate.
  assert.equal(tabCommitDirection(-95, 500, -90, 80), 1);
  // Direction must match the drag.
  assert.equal(tabCommitDirection(-95, 500, 90, 80), 0);
  // Too slow (and under 30%).
  assert.equal(tabCommitDirection(-95, 500, -20, 90), 0);
  // A short final flick can use the whole gesture's distance for the 90px gate
  // while still measuring speed from the recent 100ms window.
  assert.equal(tabCommitDirection(-95, 500, -20, 10, 100), 1);
  assert.equal(tabCommitDirection(-95, 500, -20, 10, 89), 0);
  // Negative/zero widths and a zero release offset never navigate.
  assert.equal(tabCommitDirection(-200, 0, -200, 10, 200), 0);
  assert.equal(tabCommitDirection(0, 400, -200, 10, 200), 0);
  assert.equal(TAB_FLICK.minDistance, 90);
  assert.equal(TAB_FLICK.minVelocity, 1.1);
});

test('pillCentreAt: interpolates measured centres and clamps', () => {
  const centres = [
    { x: 40, y: 20 },
    { x: 120, y: 20 },
    { x: 200, y: 16 },
  ];
  assert.deepEqual(pillCentreAt(0, centres), { x: 40, y: 20 });
  assert.deepEqual(pillCentreAt(1, centres), { x: 120, y: 20 });
  assert.deepEqual(pillCentreAt(1.5, centres), { x: 160, y: 18 });
  assert.deepEqual(pillCentreAt(-1, centres), { x: 40, y: 20 });
  assert.deepEqual(pillCentreAt(9, centres), { x: 200, y: 16 });
  assert.deepEqual(pillCentreAt(2, []), { x: 0, y: 0 });
});
