import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldDismiss } from './use-sheet-drag';

test('shouldDismiss: distance or a clear flick', () => {
  assert.ok(shouldDismiss(100, 2000));          // far enough, however slow
  assert.ok(shouldDismiss(150, 900));
  assert.ok(!shouldDismiss(99, 2000));          // slow and short: snap back
  assert.ok(shouldDismiss(60, 80));             // fast flick (0.75 px/ms)
  assert.ok(!shouldDismiss(20, 10));            // a twitch, however fast
  assert.ok(!shouldDismiss(60, 400));           // 0.15 px/ms: not a flick
  assert.ok(!shouldDismiss(0, 0));
});
