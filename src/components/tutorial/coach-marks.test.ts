import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAMERA_STEP, CAMERA_TIP, PAYOUTS_UNSET, TOURS, TOUR_TABS, stepsFor } from './coach-marks';
import { CAMERA_TUTORIAL_TARGET } from '@/lib/camera-tutorial';

const settings = TOURS['/settings'];
const titles = (matches: (s: string) => boolean) => stepsFor(settings, false, matches).map((s) => s.title);

test('no payout method: the Payouts step runs, the generic money step does not', () => {
  const t = titles((sel) => sel === PAYOUTS_UNSET);
  assert.ok(t.includes('Set up how you get paid'));
  assert.ok(!t.includes('Money, handled'));
});

test('payout method already set: the Payouts step is skipped', () => {
  const t = titles(() => false);
  assert.ok(!t.includes('Set up how you get paid'));
  assert.ok(t.includes('Money, handled'));
});

test('the Payouts step targets the Payouts row, and other tours are untouched', () => {
  const s = settings.steps.find((x) => x.title === 'Set up how you get paid');
  assert.equal(s?.selector, '[data-coach="settings-payouts"]');
  assert.equal(stepsFor(TOURS['/chat'], false).length, TOURS['/chat'].steps.length);
});

test('chat tour: messages, composer, then the camera step', () => {
  const steps = stepsFor(TOURS['/chat'], false);
  assert.deepEqual(steps.map((s) => s.selector), [
    '[data-coach="chat-messages"]',
    '[data-coach="chat-composer"]',
    CAMERA_TUTORIAL_TARGET,
  ]);
});

test('chat tour: progress counts the camera step (3 steps, empty or not)', () => {
  assert.equal(stepsFor(TOURS['/chat'], false).length, 3);
  assert.equal(stepsFor(TOURS['/chat'], true).length, 3);
});

test('chat tour: camera step is the same object as the first-sign-in tip step', () => {
  assert.ok(TOURS['/chat'].steps.includes(CAMERA_STEP));
  assert.equal(CAMERA_TIP.steps.length, 1);
  assert.equal(CAMERA_TIP.steps[0], CAMERA_STEP);
});

test('chat tour: composer step no longer repeats the camera copy', () => {
  const composer = TOURS['/chat'].steps.find((s) => s.selector === '[data-coach="chat-composer"]');
  assert.ok(composer);
  assert.notEqual(composer.title, CAMERA_STEP.title);
  assert.doesNotMatch(composer.body, /camera/i);
});

test('camera tip is not a picker tour', () => {
  assert.ok(!Object.values(TOURS).includes(CAMERA_TIP));
  assert.ok(!TOUR_TABS.includes('Camera'));
});
