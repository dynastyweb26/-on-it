import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callUnattached, unattachedErrorMessage } from './unattached-client';

const reply = (status: number, body: unknown) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

test('each failure is named in plain words', () => {
  assert.equal(unattachedErrorMessage(401, 'unauthorized'), 'Sign in to record a payment.');
  assert.match(unattachedErrorMessage(429, 'rate_limited'), /Too many tries/);
  assert.match(unattachedErrorMessage(400, 'amount_invalid'), /9,999,999\.99/);
  assert.match(unattachedErrorMessage(400, 'method_invalid'), /how they paid/);
  assert.match(unattachedErrorMessage(400, 'date_invalid'), /date/);
  assert.match(unattachedErrorMessage(400, 'title_too_long'), /200/);
  assert.match(unattachedErrorMessage(403, 'not_allowed'), /not allowed/);
  assert.match(unattachedErrorMessage(409, 'duplicate_submission'), /already saved/);
  assert.match(unattachedErrorMessage(500, 'db_insert_failed'), /Nothing was saved/);
});

test('a request that never reached the server says so', () => {
  assert.equal(unattachedErrorMessage(null), 'No connection. Nothing was saved.');
});

test('a thrown fetch is a failure, never a save', async () => {
  const out = await callUnattached('POST', {}, (async () => { throw new TypeError('offline'); }) as unknown as typeof fetch);
  assert.deepEqual(out, { ok: false, message: 'No connection. Nothing was saved.' });
});

test('signed out gets the signed-out message, not a network line', async () => {
  assert.deepEqual(await callUnattached('POST', {}, reply(401, { error: 'unauthorized' })), { ok: false, message: 'Sign in to record a payment.' });
});

test('a 200 without an id is not a save', async () => {
  assert.equal((await callUnattached('POST', {}, reply(200, { ok: true }))).ok, false);
});

test('success returns the id', async () => {
  assert.deepEqual(await callUnattached('POST', {}, reply(200, { ok: true, id: 'abc' })), { ok: true, id: 'abc' });
});
