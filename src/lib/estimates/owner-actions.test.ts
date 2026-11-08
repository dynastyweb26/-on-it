import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateLink,
  estimateShareText,
  sendErrorMessage,
} from './owner-actions';

test('send errors explain the state instead of leaking a code', () => {
  assert.equal(sendErrorMessage(409, 'approved'), 'This estimate is already approved.');
  assert.equal(sendErrorMessage(409, 'converted'), 'This estimate has already been converted.');
  assert.equal(sendErrorMessage(409, 'void'), 'This estimate can no longer be sent.');
  assert.equal(sendErrorMessage(404), "This estimate couldn't be found.");
  assert.equal(sendErrorMessage(429), 'Too many attempts. Try again in a minute.');
  assert.equal(sendErrorMessage(400, 'past_date'), "Pick a date that isn't in the past.");
  assert.equal(sendErrorMessage(500), "Couldn't create the link. Nothing was shared.");
});

test('the client link needs a token and only exists in the browser', () => {
  assert.equal(estimateLink(null), null);
  assert.equal(estimateLink(''), null);
  // No window in this test process.
  assert.equal(estimateLink('abc123'), null);
});

test('share text falls back to the product name', () => {
  assert.equal(estimateShareText('Ellis Woodworks'), 'Estimate from Ellis Woodworks');
  assert.equal(estimateShareText('  '), 'Estimate from On It');
  assert.equal(estimateShareText(null), 'Estimate from On It');
});

import { requestEstimateSend } from './owner-actions';

test('S3: a send that fails with no connection says so; online keeps the link sentence', async () => {
  const realFetch = globalThis.fetch;
  const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  globalThis.fetch = (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch;
  try {
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
    assert.deepEqual(await requestEstimateSend('e1'), {
      ok: false, message: 'You’re offline — the estimate didn’t send. Your draft is safe.',
    });
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
    assert.deepEqual(await requestEstimateSend('e1'), {
      ok: false, message: "Couldn't create the link. Nothing was shared.",
    });
  } finally {
    globalThis.fetch = realFetch;
    if (nav) Object.defineProperty(globalThis, 'navigator', nav); else delete (globalThis as { navigator?: unknown }).navigator;
  }
});
