import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { logGap, logTurn } from './write';
import type { TurnInput } from './rows';

const input: TurnInput = {
  userId: 'u1',
  conversationId: '3f0c1f2e-8a43-4f0e-9d51-6b1f4f1a2c10',
  question: 'SECRET-QUESTION-TEXT',
  reply: 'ok',
  route: 'ask',
  toolName: 'get_unpaid_invoices',
  toolRowCount: 3,
  model: 'm',
  latencyMs: 10,
  tokensIn: 1,
  tokensOut: 2,
  askedAt: new Date('2026-11-06T10:00:00Z'),
  answeredAt: new Date('2026-11-06T10:00:01Z'),
};

type Call = { table: string; op: string; args: unknown[] };

function fakeDb(result: { error: unknown } | 'throw') {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      const run = (op: string) => async (...args: unknown[]) => {
        calls.push({ table, op, args });
        if (result === 'throw') throw new Error('boom SECRET-QUESTION-TEXT');
        return result;
      };
      return { insert: run('insert'), upsert: run('upsert') };
    },
  };
  return { db: db as never, calls };
}

function captureErrors<T>(fn: () => Promise<T>): Promise<{ value: T; logged: string }> {
  const original = console.error;
  const lines: string[] = [];
  console.error = (...a: unknown[]) => lines.push(a.map((x) => JSON.stringify(x)).join(' '));
  return fn().then(
    (value) => { console.error = original; return { value, logged: lines.join('\n') }; },
    (e) => { console.error = original; throw e; },
  );
}

test('logTurn inserts both rows into chat_messages and returns the reply id', async () => {
  const { db, calls } = fakeDb({ error: null });
  const id = await logTurn(db, input);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, 'chat_messages');
  assert.equal(calls[0].op, 'insert');
  const rows = calls[0].args[0] as { id: string; role: string }[];
  assert.deepEqual(rows.map((r) => r.role), ['user', 'assistant']);
  assert.equal(id, rows[1].id);
});

test('logTurn: a database error returns null and does not throw', async () => {
  const { db } = fakeDb({ error: { code: '42501', message: 'denied' } });
  const { value, logged } = await captureErrors(() => logTurn(db, input));
  assert.equal(value, null);
  assert.match(logged, /42501/);
});

test('logTurn: a thrown error is swallowed and returns null', async () => {
  const { db } = fakeDb('throw');
  const { value } = await captureErrors(() => logTurn(db, input));
  assert.equal(value, null);
});

test('logTurn never writes the question into the error log', async () => {
  for (const result of [{ error: { code: 'x', message: 'm' } }, 'throw'] as const) {
    const { db } = fakeDb(result);
    const { logged } = await captureErrors(() => logTurn(db, input));
    assert.ok(!logged.includes('SECRET-QUESTION-TEXT'), 'question leaked into console.error');
  }
});

test('logTurn: a build step that throws before the insert (bad input) is still swallowed', async () => {
  const { db } = fakeDb({ error: null });
  const bad = { ...input, askedAt: new Date('nonsense') };
  const { value } = await captureErrors(() => logTurn(db, bad));
  assert.equal(value, null);
});

test('logGap upserts on (message_id, kind) and ignores duplicates', async () => {
  const { db, calls } = fakeDb({ error: null });
  const ok = await logGap(db, { userId: 'u1', messageId: 'm1', question: 'q', kind: 'thumbs_down' });
  assert.equal(ok, true);
  assert.equal(calls[0].table, 'help_gaps');
  assert.equal(calls[0].op, 'upsert');
  assert.deepEqual(calls[0].args[1], { onConflict: 'message_id,kind', ignoreDuplicates: true });
  assert.deepEqual(calls[0].args[0], { user_id: 'u1', message_id: 'm1', question_text: 'q', kind: 'thumbs_down' });
});

test('logGap: failure returns false and does not throw', async () => {
  const a = await captureErrors(() => logGap(fakeDb({ error: { code: 'x', message: 'm' } }).db, { userId: 'u', messageId: 'm', question: 'q', kind: 'unsupported' }));
  const b = await captureErrors(() => logGap(fakeDb('throw').db, { userId: 'u', messageId: 'm', question: 'q', kind: 'unsupported' }));
  assert.equal(a.value, false);
  assert.equal(b.value, false);
});

// The writers must never get a service-role client: they take whatever client
// the route hands them, and the routes only ever hold the session client.
for (const file of [
  'src/lib/chat-log/write.ts',
  'src/lib/chat-log/rows.ts',
  'src/app/api/ask/route.ts',
  'src/app/api/route/route.ts',
  'src/app/api/ask/feedback/route.ts',
]) {
  test(`${file} does not use the service role`, () => {
    const src = readFileSync(file, 'utf8');
    assert.ok(!/supabase\/admin|adminClient|SERVICE_ROLE/i.test(src));
  });
}

test('the routes log through logTurn, and /api/ask/feedback is gated like the rest', () => {
  const ask = readFileSync('src/app/api/ask/route.ts', 'utf8');
  const route = readFileSync('src/app/api/route/route.ts', 'utf8');
  const fb = readFileSync('src/app/api/ask/feedback/route.ts', 'utf8');
  assert.match(ask, /await logTurn\(supabase,/);
  assert.match(route, /await logTurn\(supabase,/);
  for (const src of [ask, route, fb]) assert.match(src, /!AI_TOOLS \|\| !aiToolsForEnv\(process\.env\.VERCEL_ENV\)/);
  assert.match(fb, /status: 401/);
});
