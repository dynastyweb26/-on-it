import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmProposal, keyFor } from './confirm-client';

test('posts the token and the idempotency key, nothing else', async () => {
  let sent: { url: string; body: unknown } | null = null;
  const spy = (async (url: string, init: RequestInit) => {
    sent = { url, body: JSON.parse(String(init.body)) };
    return new Response(JSON.stringify({ ok: true, rows: [{ actionId: 'a', status: 'saved', problem: null }] }), { status: 200 });
  }) as unknown as typeof fetch;
  await confirmProposal('tok-aaaaaaaa', 'key-11111111', spy);
  assert.deepEqual(sent, { url: '/api/ai/confirm', body: { token: 'tok-aaaaaaaa', idempotencyKey: 'key-11111111' } });
});

test('the key is minted once per card and reused on every retry', () => {
  const keys = new Map<string, string>();
  let n = 0;
  const mint = () => `key-${++n}`;
  assert.equal(keyFor(keys, 'card-1', mint), 'key-1');
  assert.equal(keyFor(keys, 'card-1', mint), 'key-1');
  assert.equal(keyFor(keys, 'card-2', mint), 'key-2');
  assert.equal(n, 2);
});

test("a default minted key passes the route's length rule (8 to 128)", () => {
  const k = keyFor(new Map(), 'c');
  assert.ok(k.length >= 8 && k.length <= 128);
});
