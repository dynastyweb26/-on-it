import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BACK_HOLD_MAX_MS,
  backArrived,
  backAxis,
  backBlockedAtLock,
  backCommits,
  backEnterMs,
  backOutMs,
  backScrollerHolds,
  canStartBackSwipe,
} from './back-gesture';
import { EDGE_GUARD_PX } from './swipe';

// A normal nested screen: /settings/business, one level under /settings.
const start = {
  parent: '/settings',
  path: '/settings/business',
  clientX: 160,
  touches: 1,
  guardOpen: true,
};

test('a nested route with a parent may start a back swipe', () => {
  assert.equal(canStartBackSwipe(start), true);
});

test('a screen with no parent never starts one', () => {
  assert.equal(canStartBackSwipe({ ...start, parent: null }), false);
});

test('a tab root is rejected even when a parent is supplied', () => {
  // The deck owns tab-root gestures; a second recogniser there would fight it.
  assert.equal(canStartBackSwipe({ ...start, path: '/settings', parent: '/settings' }), false);
  assert.equal(canStartBackSwipe({ ...start, path: '/invoices', parent: '/invoices' }), false);
});

test('the OS back strip is left alone, from the guard pixel outward', () => {
  assert.equal(canStartBackSwipe({ ...start, clientX: EDGE_GUARD_PX - 1 }), false);
  assert.equal(canStartBackSwipe({ ...start, clientX: EDGE_GUARD_PX }), true);
});

test('multi-touch and a landing navigation decline, but a target never decides', () => {
  assert.equal(canStartBackSwipe({ ...start, touches: 2 }), false);
  assert.equal(canStartBackSwipe({ ...start, guardOpen: false }), false);
  // The old `blocked` field is gone: what the touch landed on is judged at the
  // axis lock, so a touch on a field or a button can still become a swipe.
  assert.equal(Object.hasOwn(start, 'blocked'), false);
});

// The lock-time rules: what may be refused once the drag has gone sideways.
const free = { textEntry: false, textSelection: false, ownGesture: false, scrollableChild: false };

test('a text field does not block the swipe; a live selection in one does', () => {
  assert.equal(backBlockedAtLock({ ...free, textEntry: true }), false);
  assert.equal(backBlockedAtLock({ ...free, textEntry: true, textSelection: true }), true);
  // A selection somewhere else on the page is not a reason to refuse.
  assert.equal(backBlockedAtLock({ ...free, textSelection: true }), false);
});

test('a range input or an opted-out target always keeps the drag', () => {
  assert.equal(backBlockedAtLock({ ...free, ownGesture: true }), true);
  assert.equal(backBlockedAtLock({ ...free, textEntry: true, ownGesture: true }), true);
});

test('a horizontal scroller holds the swipe only while it can still scroll back', () => {
  assert.equal(backBlockedAtLock({ ...free, scrollableChild: true }), true);
  assert.equal(backBlockedAtLock(free), false);
  assert.equal(backScrollerHolds(120), true); // mid-rail: its gesture
  assert.equal(backScrollerHolds(0), false); // at the start edge: the page's
});

test('the axis locks once, on the shared 10px / 1.2 ratio', () => {
  assert.equal(backAxis(5, 5), 'pending');
  assert.equal(backAxis(30, 5), 'horizontal');
  assert.equal(backAxis(12, 12), 'vertical');
  assert.equal(backAxis(5, -40), 'vertical');
});

test('distance past 15% of the width commits, with no flick needed', () => {
  assert.equal(backCommits(60, 390, 0, 0), true); // 15.4% of 390
  assert.equal(backCommits(50, 390, 0, 0), false); // 12.8%, finger rested
});

test('a short flick commits only with speed in the drag direction', () => {
  assert.equal(backCommits(40, 390, 40, 60), true); // 0.67 px/ms over the last 60ms
  assert.equal(backCommits(40, 390, 5, 100), false); // 32px+ but slow
  assert.equal(backCommits(40, 390, -40, 60), false); // moved back against the drag
});

test('a leftward offset never commits, and a zero width cannot', () => {
  assert.equal(backCommits(-60, 390, -60, 60), false);
  assert.equal(backCommits(60, 0, 0, 0), false);
});

test('the outgoing page settles inside the deck bounds, shorter as it travels', () => {
  assert.equal(backOutMs(0, 390, 0), 340); // full page still to go
  assert.equal(backOutMs(390, 390, 0), 220); // already off-screen
  assert.equal(backOutMs(500, 390, 0), 220); // clamped
  assert.ok(backOutMs(200, 390, 0.7) < backOutMs(200, 390, 0));
});

test('the held page is released only once the route it left is gone', () => {
  assert.equal(backArrived('/settings/business-info', '/settings/business-info'), false);
  assert.equal(backArrived('/settings/business-info', '/settings'), true);
  assert.equal(backArrived('/invoices/inv-1', '/invoices'), true);
});

test('the hold has a ceiling, so a navigation that never lands cannot blank the screen', () => {
  assert.ok(BACK_HOLD_MAX_MS >= 500);
  assert.ok(BACK_HOLD_MAX_MS <= 1000);
});

test('the parent entrance shortens with the release speed, 180–300 ms', () => {
  assert.equal(backEnterMs(0), 300);
  assert.equal(backEnterMs(1.5), 180);
  assert.equal(backEnterMs(4), 180); // clamped
  assert.equal(backEnterMs(-2), 180); // speed is magnitude only
  assert.equal(backEnterMs(Number.NaN), 300);
});
