import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blocksTabSwipeFromOverflow } from './swipe-dom';

test('overflow: a vertical scroller does not block unless it really overflows', () => {
  assert.equal(blocksTabSwipeFromOverflow('auto', 390, 390), false);
  assert.equal(blocksTabSwipeFromOverflow('scroll', 390, 390), false);
  assert.equal(blocksTabSwipeFromOverflow('auto', 391, 390), true);
  assert.equal(blocksTabSwipeFromOverflow('scroll', 391, 390), true);
});

test('overflow: hidden or clip never blocks, even with overflowing content', () => {
  assert.equal(blocksTabSwipeFromOverflow('hidden', 420, 390), false);
  assert.equal(blocksTabSwipeFromOverflow('clip', 420, 390), false);
  assert.equal(blocksTabSwipeFromOverflow('visible', 420, 390), false);
});

test('overflow: only auto/scroll count as a horizontal scroller', () => {
  assert.equal(blocksTabSwipeFromOverflow('auto', 600, 390), true);
  assert.equal(blocksTabSwipeFromOverflow('scroll', 600, 390), true);
  assert.equal(blocksTabSwipeFromOverflow('overlay', 600, 390), false);
});
