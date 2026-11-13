import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURE_REQUEST_COPY, sendFeatureRequest } from './ask-feature-request-client';

const ID = '11111111-1111-4111-8111-111111111111';
const fake = (status: number) => (async () => new Response('{}', { status })) as unknown as typeof fetch;

test('200 is ok, and the body is the messageId only', async () => {
  let sent: { url: string; body: unknown } | null = null;
  const spy = (async (url: string, init: RequestInit) => { sent = { url, body: JSON.parse(String(init.body)) }; return new Response('{"ok":true}', { status: 200 }); }) as unknown as typeof fetch;
  assert.deepEqual(await sendFeatureRequest(ID, spy), { kind: 'ok' });
  assert.equal(sent!.url, '/api/ask/request-feature');
  assert.deepEqual(sent!.body, { messageId: ID });
});

test('401 names signed out, 429 names slow down, anything else is the designed failure line', async () => {
  assert.deepEqual(await sendFeatureRequest(ID, fake(401)), { kind: 'signed-out', message: FEATURE_REQUEST_COPY.signedOut });
  assert.deepEqual(await sendFeatureRequest(ID, fake(429)), { kind: 'rate-limited', message: FEATURE_REQUEST_COPY.slowDown });
  for (const s of [400, 403, 500]) {
    assert.deepEqual(await sendFeatureRequest(ID, fake(s)), { kind: 'error', message: FEATURE_REQUEST_COPY.failed }, String(s));
  }
  const offline = (async () => { throw new TypeError('x'); }) as unknown as typeof fetch;
  assert.deepEqual(await sendFeatureRequest(ID, offline), { kind: 'error', message: FEATURE_REQUEST_COPY.failed });
});
