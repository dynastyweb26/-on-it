import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CONFIRM_INTERVAL_MS, CONFIRM_SLOW_MS, createPlanConfirmation, planOf, type FetchLike } from './confirm';

// A clock the sleep moves: no test ever waits, and "20 seconds" is measurable.
function clock() {
  let t = 0;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => { sleeps.push(ms); t += ms; },
    sleeps,
    at: () => t,
  };
}

/** The real GET /api/access shape: tier + entitlements.plan (no top-level plan). */
const access = (plan: string | null) => ({ tier: plan ? 'active' : 'free', entitlements: { plan: plan ?? 'free' } });

/** A server that answers with each plan in turn, then repeats the last one. */
function server(plans: (string | null)[]) {
  const calls: { url: string; method: string }[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, method: init?.method ?? 'GET' });
    const plan = plans[Math.min(calls.length - 1, plans.length - 1)] ?? null;
    return { ok: true, json: async () => access(plan) };
  };
  return { fetch, calls };
}

test('confirm: success as soon as the server shows the plan', async () => {
  const c = clock();
  const { fetch, calls } = server(['plus']);
  const confirm = createPlanConfirmation({ fetch, sleep: c.sleep, now: c.now });

  const outcome = await confirm.start();

  assert.deepEqual(outcome, { status: 'success', plan: 'plus' });
  assert.deepEqual(calls, [{ url: '/api/access', method: 'GET' }]);
  assert.equal(c.sleeps.length, 0, 'no need to wait: the first read answered');
  assert.equal(confirm.waiting, false);
});

test('confirm: waits for the server, one read per second', async () => {
  const c = clock();
  const { fetch, calls } = server([null, null, 'pro']);
  const confirm = createPlanConfirmation({ fetch, sleep: c.sleep, now: c.now });

  const outcome = await confirm.start();

  assert.deepEqual(outcome, { status: 'success', plan: 'pro' });
  assert.equal(calls.length, 3);
  assert.deepEqual(c.sleeps, [CONFIRM_INTERVAL_MS, CONFIRM_INTERVAL_MS]);
  assert.equal(c.at(), 2000);
});

test('confirm: a failed read is "not yet", never a success', async () => {
  const c = clock();
  let n = 0;
  const confirm = createPlanConfirmation({
    fetch: async () => (++n === 1
      ? { ok: false, json: async () => ({}) }
      : { ok: true, json: async () => access('pro') }),
    sleep: c.sleep,
    now: c.now,
  });

  assert.deepEqual(await confirm.start(), { status: 'success', plan: 'pro' });
  assert.equal(n, 2);
});

test('confirm: still nothing at 20s is slow, not a failure', async () => {
  const c = clock();
  const { fetch, calls } = server([null]);
  const confirm = createPlanConfirmation({ fetch, sleep: c.sleep, now: c.now });

  const outcome = await confirm.start();

  assert.deepEqual(outcome, { status: 'slow' });
  assert.equal(c.at(), CONFIRM_SLOW_MS);
  assert.equal(c.sleeps.length, CONFIRM_SLOW_MS / CONFIRM_INTERVAL_MS);
  // The read at exactly 20s decides; nothing reads past it.
  assert.equal(calls.length, CONFIRM_SLOW_MS / CONFIRM_INTERVAL_MS + 1);
});

test('confirm: retry re-asks the server and never re-buys', async () => {
  const c = clock();
  // Slow first (20 s of nulls), then the webhook has landed.
  let n = 0;
  const calls: string[] = [];
  const confirm = createPlanConfirmation({
    fetch: async (url) => {
      calls.push(url);
      n++;
      const plan = n > 21 ? 'plus' : null;
      return { ok: true, json: async () => access(plan) };
    },
    sleep: c.sleep,
    now: c.now,
  });

  assert.deepEqual(await confirm.start(), { status: 'slow' });
  const before = calls.length;
  assert.deepEqual(await confirm.retry(), { status: 'success', plan: 'plus' });

  // Only reads: the wait takes no purchase adapter at all, and every request it
  // makes is the GET it was built for — no second store sheet, no new charge.
  assert.ok(calls.length > before);
  assert.ok(calls.every((u) => u === '/api/access'));
});

test('confirm: closing the wall cancels the wait, no more reads', async () => {
  const c = clock();
  const { fetch, calls } = server([null]);
  let sleeps = 0;
  const control = { cancel: () => {} };
  const confirm = createPlanConfirmation({
    fetch,
    sleep: async (ms) => {
      sleeps++;
      if (sleeps === 2) control.cancel();
      await c.sleep(ms);
    },
    now: c.now,
  });
  control.cancel = () => confirm.cancel();

  assert.deepEqual(await confirm.start(), { status: 'cancelled' });
  assert.equal(sleeps, 2);
  assert.equal(calls.length, 2, 'one read, then the poll stops');
});

test('confirm: a repeat tap joins the wait in flight instead of polling twice', async () => {
  const c = clock();
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const calls: string[] = [];
  const confirm = createPlanConfirmation({
    fetch: async (url) => {
      calls.push(url);
      await gate;
      return { ok: true, json: async () => access('plus') };
    },
    sleep: c.sleep,
    now: c.now,
  });

  const first = confirm.start();
  const second = confirm.start();
  assert.equal(first, second, 'the same wait, not a second one');
  release();
  assert.deepEqual(await first, { status: 'success', plan: 'plus' });
  assert.equal(calls.length, 1);
});

test('confirm: retry while a wait is in flight is ignored too', async () => {
  const c = clock();
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  let reads = 0;
  const confirm = createPlanConfirmation({
    fetch: async () => {
      reads++;
      await gate;
      return { ok: true, json: async () => access('pro') };
    },
    sleep: c.sleep,
    now: c.now,
  });

  const waiting = confirm.start();
  const again = confirm.retry();
  assert.equal(waiting, again);
  release();
  await waiting;
  assert.equal(reads, 1);
});

test('confirm: a Plus purchase resolves to success from the real /api/access body, not slow', async () => {
  const c = clock();
  // A Pro user buys Plus: the first reads still say Pro, then the webhook lands.
  const s = server(['pro', 'pro', 'plus']);
  const confirm = createPlanConfirmation({ fetch: s.fetch, sleep: c.sleep, now: c.now, expect: 'plus' });
  assert.deepEqual(await confirm.start(), { status: 'success', plan: 'plus' });
  assert.equal(s.calls.length, 3);
});

test('confirm: planOf reads entitlements.plan, falls back to the tier, free is null', () => {
  assert.equal(planOf({ tier: 'active', entitlements: { plan: 'plus' } }), 'plus');
  assert.equal(planOf({ tier: 'founder' }), 'plus');
  assert.equal(planOf({ tier: 'trialing' }), 'pro');
  assert.equal(planOf({ tier: 'free', entitlements: { plan: 'free' } }), null);
  assert.equal(planOf({ plan: 'plus' }), null, 'a top-level plan is not the access shape');
  assert.equal(planOf(null), null);
});
