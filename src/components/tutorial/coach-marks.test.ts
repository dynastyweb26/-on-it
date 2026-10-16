import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAYOUTS_UNSET, TOURS, stepsFor } from './coach-marks';

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
