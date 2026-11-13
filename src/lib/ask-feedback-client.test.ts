import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEEDBACK_COPY, sendThumb } from './ask-feedback-client';

const body = { messageId: '11111111-1111-4111-8111-111111111111', thumb: 'down' as const, reasons: ['wrong_number'], note: null };
const fake = (status: number) => (async () => new Response('{}', { status })) as unknown as typeof fetch;

test('200 saves', async () => {
  assert.deepEqual(await sendThumb(body, fake(200)), { kind: 'ok' });
});

test('401 names signed out, 429 names slow down, anything else is could not save', async () => {
  assert.deepEqual(await sendThumb(body, fake(401)), { kind: 'signed-out', message: FEEDBACK_COPY.signedOut });
  assert.deepEqual(await sendThumb(body, fake(429)), { kind: 'rate-limited', message: FEEDBACK_COPY.slowDown });
  for (const s of [400, 403, 404, 500, 503]) {
    assert.deepEqual(await sendThumb(body, fake(s)), { kind: 'error', message: FEEDBACK_COPY.failed }, String(s));
  }
  const offline = (async () => { throw new TypeError('network'); }) as unknown as typeof fetch;
  assert.deepEqual(await sendThumb(body, offline), { kind: 'error', message: FEEDBACK_COPY.failed });
});

test('posts the vote as the route expects it; null clears', async () => {
  let sent: { url: string; body: unknown } | null = null;
  const spy = (async (url: string, init: RequestInit) => { sent = { url, body: JSON.parse(String(init.body)) }; return new Response('{}', { status: 200 }); }) as unknown as typeof fetch;
  await sendThumb({ ...body, thumb: null, reasons: [] }, spy);
  assert.equal(sent!.url, '/api/ask/feedback');
  assert.deepEqual(sent!.body, { messageId: body.messageId, thumb: null, reasons: [], note: null });
});
