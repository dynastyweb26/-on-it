// ═══ Bank disconnect: only a confirmed server delete counts ═══
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DISCONNECT_FAILED_TOAST, requestDisconnect } from './bank-disconnect';

const ITEM = '3f1c9a5e-0000-4000-8000-000000000001';

test('disconnect posts only the item id and succeeds on a 2xx', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fake = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response('{"ok":true}', { status: 200 });
  }) as typeof fetch;

  assert.deepEqual(await requestDisconnect(ITEM, fake), { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/plaid/disconnect');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { item_id: ITEM });
  // Nothing else rides along: no token, key or email.
  assert.doesNotMatch(String(calls[0].init.body), /token|secret|email|@/i);
});

test('a refused or unreachable disconnect returns the one toast', async () => {
  for (const status of [400, 401, 404, 429, 500]) {
    const fake = (async () => new Response('{"error":"nope"}', { status })) as typeof fetch;
    assert.deepEqual(await requestDisconnect(ITEM, fake), {
      ok: false, message: DISCONNECT_FAILED_TOAST,
    });
  }

  const offline = (async () => { throw new Error('offline'); }) as typeof fetch;
  assert.deepEqual(await requestDisconnect(ITEM, offline), {
    ok: false, message: DISCONNECT_FAILED_TOAST,
  });
});
