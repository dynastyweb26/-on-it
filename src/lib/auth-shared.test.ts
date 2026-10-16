import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSharedGetUser } from './auth-shared';

type R = { data: { user: { id: string } | null }; error: unknown };
const ok: R = { data: { user: { id: 'u1' } }, error: null };

function setup(answer: () => R | Promise<R> = () => ok) {
  let calls = 0;
  let t = 0;
  const s = createSharedGetUser<R>(async () => { calls++; return answer(); }, () => t, 1000);
  return { s, calls: () => calls, advance: (ms: number) => { t += ms; } };
}

test('callers that start together share one request and one answer', async () => {
  const h = setup();
  const [a, b, c, d, e] = await Promise.all([h.s.get(), h.s.get(), h.s.get(), h.s.get(), h.s.get()]);
  assert.equal(h.calls(), 1);
  for (const r of [b, c, d, e]) assert.equal(r, a);
});

test('a later call inside the window reuses the answer; after it, asks again', async () => {
  const h = setup();
  await h.s.get();
  h.advance(999);
  await h.s.get();
  assert.equal(h.calls(), 1);
  h.advance(2);
  await h.s.get();
  assert.equal(h.calls(), 2);
});

test('signed-out and error answers are never reused', async () => {
  const out = setup(() => ({ data: { user: null }, error: null }));
  await out.s.get(); await out.s.get();
  assert.equal(out.calls(), 2);
  const err = setup(() => ({ data: { user: { id: 'u1' } }, error: new Error('x') }));
  await err.s.get(); await err.s.get();
  assert.equal(err.calls(), 2);
});

test('a rejected request is forgotten', async () => {
  let n = 0;
  const s = createSharedGetUser<R>(async () => { if (n++ === 0) throw new Error('net'); return ok; }, () => 0, 1000);
  await assert.rejects(s.get());
  assert.deepEqual(await s.get(), ok);
  assert.equal(n, 2);
});

test('clear() (auth state change) drops the answer, even one still in flight', async () => {
  const h = setup();
  await h.s.get();
  h.s.clear();
  await h.s.get();
  assert.equal(h.calls(), 2);
  // in flight when cleared: the late answer is not kept
  let release!: () => void;
  let calls = 0;
  const s = createSharedGetUser<R>(() => { calls++; return new Promise<R>((res) => { release = () => res(ok); }); }, () => 0, 1000);
  const p = s.get();
  s.clear();
  release(); await p;
  const p2 = s.get(); release(); await p2;
  assert.equal(calls, 2);
});
