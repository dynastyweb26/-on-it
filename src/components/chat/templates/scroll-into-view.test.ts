import test from 'node:test';
import assert from 'node:assert/strict';
import { smallestScroll } from './scroll-into-view';

const list = { top: 100, bottom: 500 };

test('a box that fits needs no scroll; one cut off below scrolls down by the overhang', () => {
  assert.equal(smallestScroll(list, { top: 200, bottom: 400 }), 0);
  assert.equal(smallestScroll(list, { top: 300, bottom: 560 }), 60);
});

test('a box cut off above scrolls up by the overhang', () => {
  assert.equal(smallestScroll(list, { top: 60, bottom: 300 }), -40);
});

test('a box taller than the view shows its top and never scrolls past it', () => {
  assert.equal(smallestScroll(list, { top: 150, bottom: 700 }), 0);
  assert.equal(smallestScroll(list, { top: 40, bottom: 700 }), -60);
});
