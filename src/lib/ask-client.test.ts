import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASK_COPY, askQuestion } from './ask-client';

const fake = (status: number, body: unknown = {}) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

test('200 returns the reply', async () => {
  assert.deepEqual(await askQuestion('who owes me', fake(200, { reply: 'Two are unpaid.' })), {
    kind: 'ok',
    reply: 'Two are unpaid.',
  });
});

test('sends the question text only', async () => {
  let sent: { url: string; body: string } | null = null;
  const spy = (async (url: string, init: RequestInit) => {
    sent = { url, body: String(init.body) };
    return new Response(JSON.stringify({ reply: 'ok' }), { status: 200 });
  }) as unknown as typeof fetch;
  await askQuestion('who owes me', spy);
  assert.equal(sent!.url, '/api/ask');
  assert.deepEqual(JSON.parse(sent!.body), { question: 'who owes me' });
});

test('a turn id rides along so the router and ask share one budget', async () => {
  let headers: Record<string, string> = {};
  const spy = (async (_url: string, init: RequestInit) => {
    headers = init.headers as Record<string, string>;
    return new Response(JSON.stringify({ reply: 'ok' }), { status: 200 });
  }) as unknown as typeof fetch;
  await askQuestion('who owes me', spy, 'turn-123');
  assert.equal(headers['x-turn-id'], 'turn-123');

  await askQuestion('who owes me', spy);
  assert.equal(headers['x-turn-id'], undefined, 'no turn id, no header');
});

test('401 is signed out, named as such', async () => {
  const out = await askQuestion('q', fake(401, { reply: 'Sign in' }));
  assert.deepEqual(out, { kind: 'signed-out', reply: ASK_COPY.signedOut });
});

test('429 is rate limited, named as such', async () => {
  const out = await askQuestion('q', fake(429, { reply: 'slow' }));
  assert.deepEqual(out, { kind: 'rate-limited', reply: ASK_COPY.rateLimited });
});

test('404 means the feature is off here (caller falls back to parse)', async () => {
  assert.deepEqual(await askQuestion('q', fake(404, { error: 'not found' })), { kind: 'off' });
});

test('500 is a server error', async () => {
  assert.deepEqual(await askQuestion('q', fake(500, { reply: 'x' })), {
    kind: 'error',
    reply: ASK_COPY.serverError,
  });
});

test('a 200 with no reply is an error, never a blank bubble', async () => {
  assert.equal((await askQuestion('q', fake(200, {}))).kind, 'error');
  assert.equal((await askQuestion('q', fake(200, { reply: '  ' }))).kind, 'error');
});

test('a thrown fetch is a network failure', async () => {
  const boom = (async () => { throw new TypeError('offline'); }) as unknown as typeof fetch;
  assert.deepEqual(await askQuestion('q', boom), { kind: 'network' });
});

test('copy has no "quote" and no emoji', () => {
  for (const s of Object.values(ASK_COPY)) {
    assert.doesNotMatch(s, /quote/i);
    assert.doesNotMatch(s, /\p{Extended_Pictographic}/u);
  }
});

test('200 keeps template, fallback, tool and pending when the server sends them', async () => {
  const body = {
    reply: 'Two are unpaid.',
    template: { id: 'list.ranked', props: { eyebrow: 'x' } },
    fallback: 'Two invoices are unpaid.',
    tool: { totalCount: 2 },
    pending: null,
  };
  assert.deepEqual(await askQuestion('who owes me', fake(200, body)), {
    kind: 'ok',
    reply: 'Two are unpaid.',
    template: { id: 'list.ranked', props: { eyebrow: 'x' } },
    fallback: 'Two invoices are unpaid.',
    tool: { totalCount: 2 },
  });
});

test('a null template stays absent, so the caller shows the fallback text', async () => {
  const out = await askQuestion('q', fake(200, { reply: 'r', template: null, fallback: 'Plain answer.' }));
  assert.deepEqual(out, { kind: 'ok', reply: 'r', fallback: 'Plain answer.' });
});

test('a destination is kept only when it is an in-app path', async () => {
  const ok = await askQuestion('q', fake(200, { reply: 'r', destination: { screen: 'Invoices', path: '/invoices?filter=unpaid' } }));
  assert.deepEqual(ok, { kind: 'ok', reply: 'r', destination: { screen: 'Invoices', path: '/invoices?filter=unpaid' } });
  for (const path of ['https://evil.example', '//evil.example', 'invoices']) {
    assert.deepEqual(await askQuestion('q', fake(200, { reply: 'r', destination: { screen: 'x', path } })), { kind: 'ok', reply: 'r' }, path);
  }
});
