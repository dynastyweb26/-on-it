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

test('camera tutorial: only the first signed-in visit to Chat, with a clear stage', () => {
  assert.equal(canAutoStartCameraTutorial(ready), true);
  assert.equal(canAutoStartCameraTutorial({ ...ready, signedIn: false }), false);
  assert.equal(canAutoStartCameraTutorial({ ...ready, seenAt: '2026-10-22T10:00:00.000Z' }), false);
  assert.equal(canAutoStartCameraTutorial({ ...ready, seenAt: undefined }), false); // not loaded / no column
  assert.equal(canAutoStartCameraTutorial({ ...ready, path: '/' }), false);
  assert.equal(canAutoStartCameraTutorial({ ...ready, path: '/chat/abc' }), false);
  assert.equal(canAutoStartCameraTutorial({ ...ready, coachOpen: true }), false);
  assert.equal(canAutoStartCameraTutorial({ ...ready, overlayOpen: true }), false);
  assert.equal(canAutoStartCameraTutorial({ ...ready, targetVisible: false }), false);
  assert.equal(CAMERA_TUTORIAL_TARGET, '[data-coach="chat-camera"]');
});
