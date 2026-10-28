import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cameraEnvironment,
  blockerFromError,
  cameraFailureCopy,
  canFlip,
  fitWithin,
  flipLabel,
  nextFacing,
  receiptFileName,
  videoConstraints,
} from './receipt-camera';

test('cameraEnvironment: an https page with mediaDevices is ok', () => {
  assert.equal(cameraEnvironment({ isSecureContext: true, hasMediaDevices: true, hasGetUserMedia: true }), 'ok');
});

test('cameraEnvironment: http is insecure even when the API is missing too', () => {
  assert.equal(cameraEnvironment({ isSecureContext: false, hasMediaDevices: false, hasGetUserMedia: false }), 'insecure');
});

test('cameraEnvironment: a secure page without getUserMedia is unsupported', () => {
  assert.equal(cameraEnvironment({ isSecureContext: true, hasMediaDevices: true, hasGetUserMedia: false }), 'unsupported');
  assert.equal(cameraEnvironment({ isSecureContext: true, hasMediaDevices: false, hasGetUserMedia: false }), 'unsupported');
});

test('blockerFromError: only a refusal is "denied"', () => {
  for (const name of ['NotAllowedError', 'SecurityError', 'PermissionDeniedError']) {
    assert.equal(blockerFromError({ name }), 'denied', name);
  }
});

test('blockerFromError: no camera, busy camera and bad constraints are unavailable', () => {
  for (const name of ['NotFoundError', 'NotReadableError', 'OverconstrainedError', 'AbortError', 'TypeError']) {
    assert.equal(blockerFromError({ name }), 'unavailable', name);
  }
  assert.equal(blockerFromError(null), 'unavailable');
  assert.equal(blockerFromError(undefined), 'unavailable');
});

test('cameraFailureCopy: every failure explains itself', () => {
  for (const failure of ['denied', 'insecure', 'unsupported', 'lost', 'unavailable'] as const) {
    const copy = cameraFailureCopy(failure);
    assert.ok(copy.title.length > 0, failure);
    assert.ok(copy.body.length > 0, failure);
  }
  assert.match(cameraFailureCopy('denied').body, /Settings/);
});

test('videoConstraints: rear by default, no audio, facing is only an ideal', () => {
  const rear = videoConstraints('environment').video as MediaTrackConstraints;
  assert.deepEqual(rear.facingMode, { ideal: 'environment' });
  assert.equal(videoConstraints('environment').audio, false);
  assert.deepEqual(rear.width, { ideal: 2560 });
});

test('nextFacing / flipLabel flip together', () => {
  assert.equal(nextFacing('environment'), 'user');
  assert.equal(nextFacing('user'), 'environment');
  assert.match(flipLabel('environment'), /front/);
  assert.match(flipLabel('user'), /back/);
});

test('canFlip: only with a second camera', () => {
  assert.equal(canFlip(0), false);
  assert.equal(canFlip(1), false);
  assert.equal(canFlip(2), true);
});

test('fitWithin: large frames scale down, small frames stay 1:1', () => {
  assert.deepEqual(fitWithin(4032, 3024, 2400), { width: 2400, height: 1800 });
  assert.deepEqual(fitWithin(1920, 1080, 2400), { width: 1920, height: 1080 });
  assert.deepEqual(fitWithin(3024, 4032, 2400), { width: 1800, height: 2400 });
});

test('fitWithin: no stream yet (0) draws nothing, never a 1px canvas', () => {
  assert.deepEqual(fitWithin(0, 0, 2400), { width: 0, height: 0 });
  assert.deepEqual(fitWithin(-4, 10, 2400), { width: 0, height: 0 });
  assert.deepEqual(fitWithin(Number.NaN, 10, 2400), { width: 0, height: 0 });
});

test('receiptFileName: a jpeg name', () => {
  assert.equal(receiptFileName(1700000000000), 'receipt-1700000000000.jpg');
});
