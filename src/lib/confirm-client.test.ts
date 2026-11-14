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

import { CONFIRM_COPY } from './confirm-client';
const fake = (status: number, body: unknown = {}) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

test('each refusal names its cause and shows the server\'s own sentence', async () => {
  const cases: [number, string, string, string][] = [
    [404, 'unknown_token', 'expired', 'That confirmation has expired. Ask me again and I will redo it.'],
    [410, 'expired_token', 'expired', 'That confirmation is too old. Ask me again and I will redo it.'],
    [409, 'already_confirmed', 'already-done', 'That one was already done.'],
    [409, 'state_changed', 'changed', 'That changed since I looked. Ask me again and I will redo it.'],
    [500, 'execute_failed', 'unsure', 'That may not have gone through. Check, then ask me again.'],
  ];
  for (const [status, error, cause, reply] of cases) {
    assert.deepEqual(await confirmProposal('tok-aaaaaaaa', 'key-11111111', fake(status, { error, reply })), { kind: 'error', cause, reply });
  }
});

test('signed out and slow down are their own causes', async () => {
  assert.deepEqual(await confirmProposal('t', 'k', fake(401, { error: 'signed_out', reply: "You're signed out. Sign in, then confirm." })), { kind: 'error', cause: 'signed-out', reply: "You're signed out. Sign in, then confirm." });
  assert.deepEqual(await confirmProposal('t', 'k', fake(429, { reply: 'One sec — slow down a moment.' })), { kind: 'error', cause: 'rate-limited', reply: 'One sec — slow down a moment.' });
});

test('a lost connection says offline, or that it may not have gone through', async () => {
  const down = (async () => { throw new TypeError('fail'); }) as unknown as typeof fetch;
  assert.deepEqual(await confirmProposal('t', 'k', down, () => false), { kind: 'error', cause: 'network', reply: CONFIRM_COPY.offline });
  assert.deepEqual(await confirmProposal('t', 'k', down, () => true), { kind: 'error', cause: 'network', reply: CONFIRM_COPY.dropped });
});

test('a success is painted from the rows; a partial has a failed row; no rows is an error, not "saved"', async () => {
  const rows = [{ actionId: 'a', status: 'saved', problem: null }, { actionId: 'b', status: 'failed', problem: 'Nope.' }];
  assert.deepEqual(await confirmProposal('t', 'k', fake(200, { ok: true, rows })), { kind: 'settled', state: 'partial', rows });
  assert.equal((await confirmProposal('t', 'k', fake(200, { ok: true, rows: [] }))).kind, 'error');
  assert.equal((await confirmProposal('t', 'k', fake(200, 'junk'))).kind, 'error');
});

import { shareInflight } from './confirm-client';

test('a rage-tap run sends one request, and the slot clears on success and on failure', async () => {
  const inflight = new Map<string, Promise<string>>();
  let sent = 0;
  let release!: (v: string) => void;
  const run = () => { sent++; return new Promise<string>((r) => { release = r; }); };
  const a = shareInflight(inflight, 'c1', run);
  const b = shareInflight(inflight, 'c1', run);
  assert.equal(a, b);
  assert.equal(sent, 1);
  release('ok');
  await a;
  assert.equal(inflight.size, 0);
  const bad = shareInflight(inflight, 'c1', async () => { sent++; throw new Error('x'); });
  await assert.rejects(bad);
  assert.equal(inflight.size, 0);
  shareInflight(inflight, 'c1', async () => { sent++; return 'again'; });
  assert.equal(sent, 3, 'a tap after it settled runs again');
});
