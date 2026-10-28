import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cameraEnvironment,
  blockerFromError,
  cameraFailureCopy,
  canFlip,
  coverCrop,
  fitWithin,
  isSilentFallback,
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

test('cameraFailureCopy: the flow can say what is being photographed', () => {
  assert.match(cameraFailureCopy('unavailable').body, /pick the receipt from your photos/);
  assert.match(cameraFailureCopy('unavailable', 'it').body, /pick it from your photos/);
  assert.match(cameraFailureCopy('lost', 'the photo').body, /pick the photo from your photos/);
});

test('isSilentFallback: no camera, insecure and unsupported go straight to the picker', () => {
  for (const failure of ['unsupported', 'insecure', 'unavailable'] as const) {
    assert.equal(isSilentFallback(failure, false), true, failure);
  }
});

test('isSilentFallback: a refusal always gets the screen', () => {
  assert.equal(isSilentFallback('denied', false), false);
  assert.equal(isSilentFallback('denied', true), false);
});

test('isSilentFallback: once the camera worked, nothing is silent', () => {
  for (const failure of ['unsupported', 'insecure', 'unavailable', 'lost'] as const) {
    assert.equal(isSilentFallback(failure, true), false, failure);
  }
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

test('coverCrop: a box with the frame\'s aspect keeps the whole frame', () => {
  assert.deepEqual(coverCrop(1920, 1080, 960, 540, 2400), {
    sx: 0, sy: 0, sw: 1920, sh: 1080, dw: 1920, dh: 1080,
  });
});

test('coverCrop: a landscape frame in a portrait box crops the sides, not the top', () => {
  const crop = coverCrop(1920, 1080, 400, 700, 2400);
  assert.equal(crop.sy, 0);
  assert.equal(crop.sh, 1080);
  assert.equal(crop.sx, 651.4285714285714);
  assert.equal(crop.sw, 617.1428571428571);
  assert.equal(crop.dw, 617);
  assert.equal(crop.dh, 1080);
  // What is stored has the shape of what was on screen, give or take rounding.
  assert.ok(Math.abs(crop.dw / crop.dh - 400 / 700) < 0.002);
});

test('coverCrop: a portrait frame in a landscape box crops top and bottom', () => {
  const crop = coverCrop(1080, 1920, 800, 400, 2400);
  assert.equal(crop.sx, 0);
  assert.equal(crop.sw, 1080);
  assert.equal(crop.sy, 690);
  assert.equal(crop.sh, 540);
  assert.deepEqual([crop.dw, crop.dh], [1080, 540]);
});

test('coverCrop: the crop is capped at maxEdge so a 4K sensor does not fill a canvas', () => {
  const crop = coverCrop(4000, 3000, 1000, 1000, 2400);
  assert.deepEqual([crop.sx, crop.sy], [500, 0]);
  assert.deepEqual([crop.sw, crop.sh], [3000, 3000]);
  assert.deepEqual([crop.dw, crop.dh], [2400, 2400]);
});

test('coverCrop: no frame or no box yet means no capture', () => {
  const none = { sx: 0, sy: 0, sw: 0, sh: 0, dw: 0, dh: 0 };
  assert.deepEqual(coverCrop(0, 0, 400, 700, 2400), none);
  assert.deepEqual(coverCrop(1920, 1080, 0, 0, 2400), none);
  assert.deepEqual(coverCrop(1920, 1080, 400, Number.NaN, 2400), none);
  assert.deepEqual(coverCrop(-1, 1080, 400, 700, 2400), none);
});

// The camera is a bottom sheet 70% of the viewport tall, so the box the video
// covers is short and wide on a phone in portrait and very short in landscape.
// These are the two boxes the capture actually sees (390×844 and 844×390).
test('coverCrop: the 70dvh sheet on a portrait phone crops a landscape sensor frame', () => {
  const sheet = { width: 390, height: 844 * 0.7 }; // 390 × 590.8, edge to edge
  const crop = coverCrop(1920, 1080, sheet.width, sheet.height, 2400);
  // A landscape frame is taller than the sheet needs: the sides go, all of the
  // sensor's height stays, and nothing is shifted off-centre.
  assert.ok(Math.abs(crop.sh - 1080) < 1e-6, 'keeps the full frame height');
  assert.ok(Math.abs(crop.sy) < 1e-6, 'no vertical offset');
  const scale = Math.max(sheet.width / 1920, sheet.height / 1080);
  assert.ok(Math.abs(crop.sw - sheet.width / scale) < 1e-6, 'sides cropped only');
  assert.ok(Math.abs(crop.sx + crop.sw / 2 - 1920 / 2) < 1e-6, 'centred');
  // What gets stored has the sheet's shape: it is the picture on screen.
  assert.ok(Math.abs(crop.dw / crop.dh - sheet.width / sheet.height) < 0.002);
});

test('coverCrop: the short landscape sheet keeps a band of the frame, edge to edge', () => {
  const sheet = { width: 844, height: 390 * 0.7 }; // 844 × 273
  const crop = coverCrop(1920, 1080, sheet.width, sheet.height, 2400);
  // Now the sheet is wider than the frame's shape, so the width fills exactly
  // and the visible band is the middle of the sensor frame.
  assert.ok(Math.abs(crop.sw - 1920) < 1e-6, 'keeps the full frame width');
  assert.ok(Math.abs(crop.sx) < 1e-6, 'no horizontal offset');
  assert.ok(Math.abs(crop.sy + crop.sh / 2 - 1080 / 2) < 1e-6, 'centred vertically');
  assert.ok(Math.abs(crop.dw / crop.dh - sheet.width / sheet.height) < 0.002);
});

test('receiptFileName: a jpeg name', () => {
  assert.equal(receiptFileName(1700000000000), 'receipt-1700000000000.jpg');
});
