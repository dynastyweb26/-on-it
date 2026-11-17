import { after, test } from 'node:test';
import assert from 'node:assert/strict';

import { PLUS_STORE_ONLY, START_UNAVAILABLE, purchases, webPurchases, type Purchases, type PurchaseOutcome } from './start';
import { RESTORE_UNAVAILABLE } from './restore';

// Node has no browser: stub the two globals the adapter touches (fetch and the
// navigation target) and put the originals back afterwards.
const realFetch = globalThis.fetch;
const realWindow = (globalThis as { window?: unknown }).window;

after(() => {
  Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: realFetch });
  if (realWindow === undefined) delete (globalThis as { window?: unknown }).window;
  else Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: realWindow });
});

type Handler = (url: string, init?: RequestInit) => Promise<Response>;

function browser(handler: Handler) {
  const calls: { url: string; body: unknown }[] = [];
  const nav = { href: '' };
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: { location: nav } });
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    writable: true,
    value: async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body });
      return handler(String(url), init);
    },
  });
  return { calls, nav };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('purchase: Pro on the web is today’s Stripe start, typed pending', async () => {
  const { calls, nav } = browser(async () => json({ url: 'https://checkout.stripe.com/c/pay/test' }));

  const outcome = await purchases.start('pro', { returnTo: 'invoices' });

  assert.deepEqual(outcome, { status: 'pending' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/checkout');
  assert.deepEqual(JSON.parse(String(calls[0].body)), { returnTo: 'invoices' });
  assert.equal(nav.href, 'https://checkout.stripe.com/c/pay/test');
  assert.equal(purchases, webPurchases, 'the web build serves the web adapter');
});

test('purchase: anything Plus is store-only on the web, and charges nothing', async () => {
  const { calls, nav } = browser(async () => json({ url: 'https://should.not/be-used' }));

  for (const outcome of [
    await purchases.start('plus'),
    await purchases.upgrade(),
  ]) {
    assert.deepEqual(outcome, { status: 'failed', cause: 'store_only', message: PLUS_STORE_ONLY });
  }
  for (const outcome of [await purchases.switchToPro(), await purchases.keepPlus()]) {
    assert.deepEqual(outcome, { status: 'failed', cause: 'store_only', message: PLUS_STORE_ONLY });
  }

  assert.equal(calls.length, 0, 'no request is made for a plan the web cannot sell');
  assert.equal(nav.href, '', 'and the browser never leaves the screen');
});

test('purchase: restore on the web is store-only, with the honest message', async () => {
  const { nav } = browser(async () => json({}));

  assert.deepEqual(await purchases.restore(), {
    status: 'failed',
    cause: 'store_only',
    message: RESTORE_UNAVAILABLE,
  });
  assert.equal(nav.href, '');
});

test('purchase: manage is today’s billing portal, typed pending', async () => {
  const { calls, nav } = browser(async () => json({ url: 'https://billing.stripe.com/p/session/test' }));

  assert.deepEqual(await purchases.manage(), { status: 'pending' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/billing-portal');
  assert.equal(nav.href, 'https://billing.stripe.com/p/session/test');
});

test('purchase: a dormant portal names its cause and keeps the server’s message', async () => {
  const { nav } = browser(async () =>
    json({ error: 'billing_not_configured', message: 'Billing management isn’t available yet.' }, 503));

  assert.deepEqual(await purchases.manage(), {
    status: 'failed',
    cause: 'billing_not_configured',
    message: 'Billing management isn’t available yet.',
  });
  assert.equal(nav.href, '');
});

test('purchase: a signed-out 401 is signed_out, and an unknown code is unavailable', async () => {
  browser(async () => json({ error: 'unauthorized' }, 401));
  const signedOut = await purchases.start('pro');
  assert.equal(signedOut.status, 'failed');
  assert.equal(signedOut.status === 'failed' && signedOut.cause, 'signed_out');

  browser(async () => json({ error: 'something_new' }, 500));
  const unknown = await purchases.start('pro');
  assert.equal(unknown.status === 'failed' && unknown.cause, 'unavailable');
  assert.equal(unknown.status === 'failed' && unknown.message, START_UNAVAILABLE);
});

test('purchase: a dropped connection is a failed result, not a crash', async () => {
  const { nav } = browser(async () => { throw new TypeError('Failed to fetch'); });

  const outcome = await purchases.start('pro');

  assert.deepEqual(outcome, { status: 'failed', cause: 'unavailable', message: START_UNAVAILABLE });
  assert.equal(nav.href, '');
});

test('purchase: the interface carries cancelled straight back to the screen', async () => {
  // The store sheet's "back" is not a failure. An adapter that sees it answers
  // `cancelled`, and the screen goes back to idle with no message.
  const quiet: Purchases = {
    source: 'native',
    start: async () => ({ status: 'cancelled' }),
    upgrade: async () => ({ status: 'cancelled' }),
    switchToPro: async () => ({ status: 'cancelled' }),
    keepPlus: async () => ({ status: 'cancelled' }),
    restore: async () => ({ status: 'cancelled' }),
    manage: async () => ({ status: 'cancelled' }),
  };
  assert.deepEqual(await quiet.start('plus'), { status: 'cancelled' });
  assert.deepEqual(await quiet.upgrade(), { status: 'cancelled' });
});

test('purchase: the six typed results the screens switch on', () => {
  const shapes: PurchaseOutcome[] = [
    { status: 'cancelled' },
    { status: 'pending' },
    { status: 'confirming' },
    { status: 'slow' },
    { status: 'failed', cause: 'unavailable', message: 'x' },
    { status: 'success', plan: 'plus' },
  ];
  assert.deepEqual(
    shapes.map((s) => s.status),
    ['cancelled', 'pending', 'confirming', 'slow', 'failed', 'success'],
  );
});
