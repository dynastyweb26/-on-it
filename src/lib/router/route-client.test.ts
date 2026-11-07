import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRouterClient } from './route-client';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('an ok answer carries the route and its composed reply', async () => {
  const client = createRouterClient(async () =>
    jsonResponse({ route: 'unsupported', via: 'router', reply: "I can't look that up yet." }));
  assert.deepEqual(await client('how much did I spend on gas?'), {
    route: 'unsupported',
    reply: "I can't look that up yet.",
    bypass: null,
  });
});

test('feature off (404), a bad body and an unknown route all mean null', async () => {
  for (const res of [
    jsonResponse({ error: 'not found' }, 404),
    jsonResponse({ route: 'invoice' }),
    jsonResponse({}),
    new Response('not json', { status: 200 }),
  ]) {
    const client = createRouterClient(async () => res);
    assert.equal(await client('x'), null);
  }
});

test('a network error means null, never a throw', async () => {
  const client = createRouterClient(async () => {
    throw new TypeError('offline');
  });
  assert.equal(await client('x'), null);
});

test('a hung request is cut by the client ceiling', async () => {
  const client = createRouterClient(
    (_input, init) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      }),
    40,
  );
  assert.equal(await client('x'), null);
});

test('rage-tap: two calls in flight share ONE request and one answer', async () => {
  let calls = 0;
  const client = createRouterClient(async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 10));
    return jsonResponse({ route: 'ask' });
  });
  const [a, b] = await Promise.all([client('who owes me'), client('who owes me')]);
  assert.equal(calls, 1);
  assert.deepEqual(a, { route: 'ask', reply: null, bypass: null });
  assert.equal(a, b);
});

test('a second turn after the first settles makes its own request', async () => {
  let calls = 0;
  const client = createRouterClient(async () => {
    calls += 1;
    return jsonResponse({ route: 'build' });
  });
  await client('invoice a');
  await client('invoice b');
  assert.equal(calls, 2);
});
