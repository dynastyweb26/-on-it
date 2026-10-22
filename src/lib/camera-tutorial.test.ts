import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAMERA_TUTORIAL_TARGET, canAutoStartCameraTutorial } from './camera-tutorial';

const ready = {
  signedIn: true,
  seenAt: null,
  path: '/chat',
  coachOpen: false,
  overlayOpen: false,
  targetVisible: true,
} as const;

test('camera tutorial gate: starts when every condition is met', () => {
  assert.equal(canAutoStartCameraTutorial(ready), true);
});

test('camera tutorial gate: needs a signed-in user', () => {
  assert.equal(canAutoStartCameraTutorial({ ...ready, signedIn: false }), false);
});

test('camera tutorial gate: needs the flag to be null (never seen)', () => {
  assert.equal(canAutoStartCameraTutorial({ ...ready, seenAt: '2026-10-22T10:00:00.000Z' }), false);
  assert.equal(canAutoStartCameraTutorial({ ...ready, seenAt: undefined }), false); // not loaded / no column
});

test('camera tutorial gate: needs the exact /chat path', () => {
  assert.equal(canAutoStartCameraTutorial({ ...ready, path: '/' }), false);
  assert.equal(canAutoStartCameraTutorial({ ...ready, path: '/chat/abc' }), false);
  assert.equal(canAutoStartCameraTutorial({ ...ready, path: '/invoices' }), false);
});

test('camera tutorial gate: waits while a coach tour is open', () => {
  assert.equal(canAutoStartCameraTutorial({ ...ready, coachOpen: true }), false);
});

test('camera tutorial gate: waits while a dialog or menu is open', () => {
  assert.equal(canAutoStartCameraTutorial({ ...ready, overlayOpen: true }), false);
});

test('camera tutorial gate: waits until the camera target is visible', () => {
  assert.equal(canAutoStartCameraTutorial({ ...ready, targetVisible: false }), false);
});

test('camera tutorial target selector', () => {
  assert.equal(CAMERA_TUTORIAL_TARGET, '[data-coach="chat-camera"]');
});
