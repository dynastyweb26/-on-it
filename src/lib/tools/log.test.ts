// Logging is telemetry, so the only unacceptable failure is one that breaks the
// turn. These tests pin the row shape and the never-throw contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import { logTurn, sessionFrom, turnIndexFrom, type ChatLogRow } from './log';

const row: ChatLogRow = {
  userId: '11111111-1111-1111-1111-111111111111',
  sessionId: 'chat-1',
  turn: 2,
  userText: 'Who owes me money?',
  replyText: 'Two invoices are unpaid, $120.00 in total.',
  toolsCalled: ['unpaid_invoices'],
  templateId: 'list.ranked',
  inputTokens: 120,
  outputTokens: 40,
};

test('a turn is written with its tools, template and tokens', async () => {
  const written: ChatLogRow[] = [];
  const id = await logTurn({
    insert: async (r) => { written.push(r); return 'message-1'; },
  }, row);
  assert.equal(id, 'message-1');
  assert.deepEqual(written, [row]);
});

test('a write failure is logged and swallowed, never thrown into the turn', async () => {
  const id = await logTurn({
    insert: async () => { throw new Error('permission denied'); },
  }, row);
  assert.equal(id, null);
});

test('out-of-range values are bounded instead of rejected by the table', async () => {
  const written: ChatLogRow[] = [];
  await logTurn({ insert: async (r) => { written.push(r); return 'message-1'; } }, {
    ...row,
    sessionId: 'x'.repeat(300),
    turn: 0,
    userText: 'q'.repeat(5000),
    replyText: 'a'.repeat(9000),
    toolsCalled: Array.from({ length: 30 }, (_, i) => `tool_${i}`),
  });
  assert.equal(written[0].sessionId.length, 120);
  assert.equal(written[0].turn, 1);
  assert.equal(written[0].userText.length, 4000, 'question capped, never rejected');
  assert.equal(written[0].replyText?.length, 8000, 'reply capped, never rejected');
  assert.equal(written[0].toolsCalled.length, 20);
});

test('a turn without a reply stores a null reply, not an empty one', async () => {
  const written: ChatLogRow[] = [];
  await logTurn({ insert: async (r) => { written.push(r); return 'message-1'; } }, { ...row, replyText: null });
  assert.equal(written[0].replyText, null);
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
