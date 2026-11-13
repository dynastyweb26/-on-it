import test from 'node:test';
import assert from 'node:assert/strict';
import { guardedTap } from './pending-tap';

const tick = () => new Promise((r) => setTimeout(r, 0));

test('pending is set synchronously and a rage-tap runs the work once', async () => {
  let calls = 0;
  let release!: () => void;
  const work = () => { calls++; return new Promise<void>((r) => { release = r; }); };
  const states: boolean[] = [];
  const tap = guardedTap(work, (p) => states.push(p));
  tap(); tap(); tap();
  assert.deepEqual(states, [true], 'pending is on before anything awaits');
  assert.equal(calls, 1);
  release();
  await tick();
  assert.deepEqual(states, [true, false]);
  tap();
  assert.equal(calls, 2, 'a tap after it settled runs again');
});

test('pending clears when the work rejects or throws', async () => {
  const states: boolean[] = [];
  guardedTap(async () => { throw new Error('boom'); }, (p) => states.push(p))();
  await tick();
  assert.deepEqual(states, [true, false]);
  const s2: boolean[] = [];
  guardedTap(() => { throw new Error('sync'); }, (p) => s2.push(p))();
  await tick();
  assert.deepEqual(s2, [true, false]);
});
