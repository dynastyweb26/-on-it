// Logging is telemetry, so the only unacceptable failure is one that breaks the
// turn. These tests pin the row shape and the never-throw contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import { logTurn, sessionFrom, turnIndexFrom, type ChatLogRow } from './log';

const row: ChatLogRow = {
  userId: '11111111-1111-1111-1111-111111111111',
  sessionId: 'chat-1',
  turn: 2,
  toolsCalled: ['unpaid_invoices'],
  templateId: 'unpaid_list',
  inputTokens: 120,
  outputTokens: 40,
};

test('a turn is written with its tools, template and tokens', async () => {
  const written: ChatLogRow[] = [];
  const ok = await logTurn({ insert: async (r) => { written.push(r); } }, row);
  assert.equal(ok, true);
  assert.deepEqual(written, [row]);
});

test('a write failure is logged and swallowed, never thrown into the turn', async () => {
  const ok = await logTurn({
    insert: async () => { throw new Error('permission denied'); },
  }, row);
  assert.equal(ok, false);
});

test('out-of-range values are bounded instead of rejected by the table', async () => {
  const written: ChatLogRow[] = [];
  await logTurn({ insert: async (r) => { written.push(r); } }, {
    ...row,
    sessionId: 'x'.repeat(300),
    turn: 0,
    toolsCalled: Array.from({ length: 30 }, (_, i) => `tool_${i}`),
  });
  assert.equal(written[0].sessionId.length, 120);
  assert.equal(written[0].turn, 1);
  assert.equal(written[0].toolsCalled.length, 20);
});

test('the session and turn come from headers when the client sends them', () => {
  const headers = new Headers({ 'x-chat-session': 'thread-9', 'x-turn-index': '4' });
  assert.equal(sessionFrom(headers), 'thread-9');
  assert.equal(turnIndexFrom(headers), 4);

  const turnOnly = new Headers({ 'x-turn-id': 'turn-abc' });
  assert.equal(sessionFrom(turnOnly), 'turn-abc');
  assert.equal(sessionFrom(new Headers()), 'unknown');
  assert.equal(turnIndexFrom(new Headers()), 1);
  assert.equal(turnIndexFrom(new Headers({ 'x-turn-index': 'zero' })), 1);
});
