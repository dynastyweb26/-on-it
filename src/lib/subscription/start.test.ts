import { after, test } from 'node:test';
import assert from 'node:assert/strict';

import { START_UNAVAILABLE, startSubscription } from './start';

// Node has no browser: stub the two globals the action touches (fetch and the
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

test('sends the return path and follows the Checkout url', async () => {
  const { calls, nav } = browser(async () => json({ url: 'https://checkout.stripe.com/c/pay/test' }));

  const outcome = await startSubscription('invoices');

  assert.deepEqual(outcome, { started: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/checkout');
  assert.deepEqual(JSON.parse(String(calls[0].body)), { returnTo: 'invoices' });
  assert.equal(nav.href, 'https://checkout.stripe.com/c/pay/test');
});

test('a dormant checkout keeps the user on the wall with the server message', async () => {
  const { nav } = browser(async () =>
    json({ error: 'billing_not_configured', message: 'Payments aren’t live yet — hang tight, we’ll let you know.' }, 503));

  const outcome = await startSubscription('recurring');

  assert.deepEqual(outcome, {
    started: false,
    message: 'Payments aren’t live yet — hang tight, we’ll let you know.',
  });
  assert.equal(nav.href, '', 'no navigation without a url');
});

test('a failure with no readable body falls back to the wall copy', async () => {
  const { nav } = browser(async () => new Response('Internal Server Error', { status: 500 }));

  const outcome = await startSubscription('chat');

  assert.deepEqual(outcome, { started: false, message: START_UNAVAILABLE });
  assert.equal(nav.href, '');
});

test('a dropped connection is a message, not a crash', async () => {
  const { nav } = browser(async () => { throw new TypeError('Failed to fetch'); });

  const outcome = await startSubscription('books');

  assert.deepEqual(outcome, { started: false, message: START_UNAVAILABLE });
  assert.equal(nav.href, '');
});

test('a url-less payload never navigates', async () => {
  const { nav } = browser(async () => json({ message: 'Too many attempts. Wait a bit and try again.' }));

  const outcome = await startSubscription('settings');

  assert.deepEqual(outcome, { started: false, message: 'Too many attempts. Wait a bit and try again.' });
  assert.equal(nav.href, '');
});
