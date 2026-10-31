// Close-on-drag decisions for the photo viewer (lib/photo-dismiss.ts).
//
// The gesture is the first photo's rightward drag: it dismisses, follows the
// finger and slides the viewer away when the release commits. Everything below
// is pure, so the thresholds are checked here instead of on a device — the same
// shape as back-gesture.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  photoDismissAxis,
  photoDismissCommits,
  photoDismissOutMs,
  photoDismissSpringMs,
  photoDismissStarts,
} from './photo-dismiss';

const WIDTH = 390;

test('the axis is decided only after real travel', () => {
  assert.equal(photoDismissAxis(2, 2), 'pending', 'a tap is not a drag');
  assert.equal(photoDismissAxis(40, 5), 'horizontal');
  assert.equal(photoDismissAxis(5, 40), 'vertical', 'a vertical drag is not ours');
});

test('a rightward horizontal drag at the first photo is the dismissal', () => {
  assert.equal(photoDismissStarts(0, 30, 'horizontal'), true);
});

test('rightward at a later photo stays photo navigation', () => {
  assert.equal(photoDismissStarts(1, 30, 'horizontal'), false);
  assert.equal(photoDismissStarts(3, 30, 'horizontal'), false);
});

test('leftward and non-horizontal drags never dismiss', () => {
  assert.equal(photoDismissStarts(0, -30, 'horizontal'), false, 'leftward is the next photo');
  assert.equal(photoDismissStarts(0, 30, 'vertical'), false);
  assert.equal(photoDismissStarts(0, 30, 'pending'), false);
});

test('a single photo: any rightward travel closes', () => {
  assert.equal(photoDismissCommits(8, WIDTH, 8, 100, 1), true);
  assert.equal(photoDismissCommits(0, WIDTH, 0, 100, 1), false, 'no travel, no close');
  assert.equal(photoDismissCommits(-60, WIDTH, -60, 100, 1), false);
});

test('several photos: a short, slow drag springs back', () => {
  assert.equal(photoDismissCommits(20, WIDTH, 20, 300, 3), false);
  assert.equal(photoDismissCommits(40, WIDTH, 4, 200, 3), false, 'resting before release is not a flick');
});

test('several photos: past 15% of the width closes', () => {
  assert.equal(photoDismissCommits(70, WIDTH, 70, 300, 3), true);
});

test('several photos: a flick closes short of the distance', () => {
  assert.equal(photoDismissCommits(40, WIDTH, 40, 50, 2), true);
});

test('leftward never commits, however far', () => {
  assert.equal(photoDismissCommits(-120, WIDTH, -120, 50, 3), false);
});

test('the slide-out and the spring stay inside the deck settle bounds', () => {
  const out = photoDismissOutMs(40, WIDTH, 0.5);
  const back = photoDismissSpringMs(60, WIDTH, 0.3);
  for (const ms of [out, back]) {
    assert.ok(Number.isInteger(ms));
    assert.ok(ms >= 220 && ms <= 340, `${ms}ms is outside 220–340ms`);
  }
  assert.ok(photoDismissOutMs(WIDTH, WIDTH, 1.5) <= photoDismissOutMs(0, WIDTH, 1.5));
});
