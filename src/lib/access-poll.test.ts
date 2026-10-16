import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UNLOCK_BACKOFF_MS, accessIsPaid, pollUntilPaid, type AccessRead } from './access-poll';

const free: AccessRead = { tier: 'free', hasAccess: false, canExport: false };
const paid: AccessRead = { tier: 'active', hasAccess: true, canExport: true };

function harness(answers: Array<AccessRead | null | 'throw'>) {
  const waits: number[] = [];
  let i = 0;
  return {
    waits,
    reads: () => i,
    sleep: async (ms: number) => { waits.push(ms); },
    read: async () => {
      const a = answers[Math.min(i++, answers.length - 1)];
      if (a === 'throw') throw new Error('network');
      return a;
    },
  };
}

test('backoff is 1s, 2s, then 3s steps and sums to about 20s', () => {
  assert.deepEqual(UNLOCK_BACKOFF_MS.slice(0, 3), [1000, 2000, 3000]);
  assert.equal(UNLOCK_BACKOFF_MS.reduce((a, b) => a + b, 0), 20000);
});

test('stops at the first paid read and waits only as long as needed', async () => {
  const h = harness([free, free, paid]);
  const r = await pollUntilPaid(h.read, h.sleep);
  assert.equal(r.status, 'paid');
  assert.equal(r.reads, 3);
  assert.deepEqual(h.waits, [1000, 2000, 3000]);
});

test('already paid on the first read: one wait, one read', async () => {
  const h = harness([paid]);
  const r = await pollUntilPaid(h.read, h.sleep);
  assert.equal(r.status, 'paid');
  assert.deepEqual(h.waits, [1000]);
});

test('gives up after the last delay and returns the last good read', async () => {
  const h = harness([free]);
  const r = await pollUntilPaid(h.read, h.sleep);
  assert.equal(r.status, 'timeout');
  assert.equal(r.reads, UNLOCK_BACKOFF_MS.length);
  assert.deepEqual(h.waits, [...UNLOCK_BACKOFF_MS]);
  assert.equal(r.access, free);
});

test('failed reads (null, throw) count as attempts and do not stop the poll', async () => {
  const h = harness([null, 'throw', paid]);
  const r = await pollUntilPaid(h.read, h.sleep);
  assert.equal(r.status, 'paid');
  assert.equal(r.reads, 3);
});

test('never answering gives a timeout with no access', async () => {
  const h = harness([null]);
  const r = await pollUntilPaid(h.read, h.sleep, [10, 10]);
  assert.deepEqual(r, { status: 'timeout', access: null, reads: 2 });
});

test('accessIsPaid: paid tiers, founder, and paywall-off all count; free and canceled do not', () => {
  for (const tier of ['active', 'trialing', 'past_due', 'founder']) assert.equal(accessIsPaid({ tier }), true, tier);
  assert.equal(accessIsPaid({ tier: 'free', canExport: false }), false);
  assert.equal(accessIsPaid({ tier: 'canceled', canExport: false }), false);
  assert.equal(accessIsPaid({ tier: 'free', canExport: true }), true); // paywall off
  assert.equal(accessIsPaid(null), false);
});
