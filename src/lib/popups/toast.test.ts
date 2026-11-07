import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOAST_INFO_MS, TOAST_UNDO_MS, timeBarPercent, toastAutoDismiss, toastDuration } from './toast';

test('toastDuration: 2.4 s info, 6 s when there is an undo', () => {
  assert.equal(toastDuration(false), TOAST_INFO_MS);
  assert.equal(toastDuration(true), TOAST_UNDO_MS);
  assert.equal(TOAST_INFO_MS, 2400);
  assert.equal(TOAST_UNDO_MS, 6000);
});

test('toastAutoDismiss: only a settled toast expires', () => {
  assert.equal(toastAutoDismiss('idle'), true);
  assert.equal(toastAutoDismiss('pending'), false);
  assert.equal(toastAutoDismiss('error'), false);
});

test('timeBarPercent: full at the start, empty at the end, clamped between', () => {
  assert.equal(timeBarPercent(0, 6000), 100);
  assert.equal(timeBarPercent(3000, 6000), 50);
  assert.equal(timeBarPercent(6000, 6000), 0);
  assert.equal(timeBarPercent(9000, 6000), 0);
  assert.equal(timeBarPercent(0, 0), 0);
});
