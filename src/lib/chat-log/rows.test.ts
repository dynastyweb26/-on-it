import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FeedbackBody,
  MAX_REASON,
  MAX_TEXT,
  buildTurnRows,
  conversationIdFor,
  gapKindForVote,
  normalizeReason,
  wholeOrNull,
  type TurnInput,
} from './rows';

const UUID = '3f0c1f2e-8a43-4f0e-9d51-6b1f4f1a2c10';

function ids() {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
}

const base: TurnInput = {
  userId: 'u1',
  conversationId: UUID,
  question: 'who hasn\'t paid me',
  reply: 'You have 2 unpaid invoices.',
  route: 'ask',
  toolName: 'get_unpaid_invoices',
  toolRowCount: 2,
  model: 'claude-haiku-4-5',
  latencyMs: 840,
  tokensIn: 410,
  tokensOut: 55,
  askedAt: new Date('2026-11-06T10:00:00.000Z'),
  answeredAt: new Date('2026-11-06T10:00:00.840Z'),
};

test('a turn is two rows, question first, reply stamped later', () => {
  const { rows, assistantId } = buildTurnRows(base, ids());
  assert.equal(rows.length, 2);
  assert.equal(rows[0].role, 'user');
  assert.equal(rows[1].role, 'assistant');
  assert.equal(rows[1].id, assistantId);
  assert.ok(rows[0].created_at < rows[1].created_at);
  assert.equal(rows[0].conversation_id, rows[1].conversation_id);
});

test('reply is always stamped after the question, even on a clock tie', () => {
  const { rows } = buildTurnRows({ ...base, answeredAt: base.askedAt }, ids());
  assert.ok(rows[0].created_at < rows[1].created_at);
});

test('tool is logged by name and row count; model, latency, tokens ride the reply only', () => {
  const { rows } = buildTurnRows(base, ids());
  const [user, assistant] = rows;
  assert.equal(assistant.tool_name, 'get_unpaid_invoices');
  assert.equal(assistant.tool_row_count, 2);
  assert.equal(assistant.model, 'claude-haiku-4-5');
  assert.equal(assistant.latency_ms, 840);
  assert.equal(assistant.tokens_in, 410);
  assert.equal(assistant.tokens_out, 55);
  for (const key of ['tool_name', 'tool_row_count', 'model', 'latency_ms', 'tokens_in', 'tokens_out'] as const) {
    assert.equal(user[key], null, `user row ${key}`);
  }
});

test('a row can only carry the whitelisted columns, so returned rows cannot ride along', () => {
  const { rows } = buildTurnRows(base, ids());
  const allowed = [
    'id', 'user_id', 'conversation_id', 'role', 'text', 'route', 'tool_name',
    'tool_row_count', 'model', 'latency_ms', 'tokens_in', 'tokens_out', 'created_at',
  ];
  for (const row of rows) assert.deepEqual(Object.keys(row).sort(), [...allowed].sort());
});

test('no tool ran: the row count is null even if a number is passed', () => {
  const { rows } = buildTurnRows({ ...base, toolName: null, toolRowCount: 7 }, ids());
  assert.equal(rows[1].tool_name, null);
  assert.equal(rows[1].tool_row_count, null);
});

test('a tool that returned nothing logs a count of 0, not null', () => {
  const { rows } = buildTurnRows({ ...base, toolRowCount: 0 }, ids());
  assert.equal(rows[1].tool_row_count, 0);
});

test('route is recorded on both rows', () => {
  const { rows } = buildTurnRows({ ...base, route: 'unsupported', toolName: null, toolRowCount: null }, ids());
  assert.deepEqual(rows.map((r) => r.route), ['unsupported', 'unsupported']);
});

test('text is capped at the column limit', () => {
  const long = 'x'.repeat(MAX_TEXT + 500);
  const { rows } = buildTurnRows({ ...base, question: long, reply: long }, ids());
  assert.equal(rows[0].text.length, MAX_TEXT);
  assert.equal(rows[1].text.length, MAX_TEXT);
});

test('wholeOrNull: negatives, NaN and non-numbers become null; fractions round', () => {
  assert.equal(wholeOrNull(-1), null);
  assert.equal(wholeOrNull(Number.NaN), null);
  assert.equal(wholeOrNull(undefined), null);
  assert.equal(wholeOrNull(12.6), 13);
  assert.equal(wholeOrNull(0), 0);
});

test('bad numbers never reach the row (the DB checks would refuse the whole insert)', () => {
  const { rows } = buildTurnRows({ ...base, latencyMs: -5, tokensIn: Number.NaN, tokensOut: null }, ids());
  assert.equal(rows[1].latency_ms, null);
  assert.equal(rows[1].tokens_in, null);
  assert.equal(rows[1].tokens_out, null);
});

test('conversationIdFor keeps a valid uuid and replaces anything else', () => {
  assert.equal(conversationIdFor(UUID, () => 'fresh'), UUID);
  assert.equal(conversationIdFor('not-a-uuid', () => 'fresh'), 'fresh');
  assert.equal(conversationIdFor(undefined, () => 'fresh'), 'fresh');
  assert.equal(conversationIdFor(null, () => 'fresh'), 'fresh');
});

test('FeedbackBody accepts only -1 and 1 and a uuid message id', () => {
  assert.ok(FeedbackBody.safeParse({ messageId: UUID, rating: 1 }).success);
  assert.ok(FeedbackBody.safeParse({ messageId: UUID, rating: -1, reason: 'wrong' }).success);
  assert.ok(FeedbackBody.safeParse({ messageId: UUID, rating: -1, reason: null }).success);
  assert.ok(!FeedbackBody.safeParse({ messageId: UUID, rating: 0 }).success);
  assert.ok(!FeedbackBody.safeParse({ messageId: UUID, rating: 2 }).success);
  assert.ok(!FeedbackBody.safeParse({ messageId: UUID, rating: '1' }).success);
  assert.ok(!FeedbackBody.safeParse({ messageId: 'abc', rating: 1 }).success);
  assert.ok(!FeedbackBody.safeParse({ rating: 1 }).success);
});

test('normalizeReason trims, drops blanks and caps', () => {
  assert.equal(normalizeReason('  too vague  '), 'too vague');
  assert.equal(normalizeReason('   '), null);
  assert.equal(normalizeReason(null), null);
  assert.equal(normalizeReason(undefined), null);
  assert.equal(normalizeReason('y'.repeat(MAX_REASON + 50))?.length, MAX_REASON);
});

test('gapKindForVote: a thumbs-down on an answer is a gap; a thumbs-up is not', () => {
  assert.equal(gapKindForVote({ rating: -1, messageRoute: 'ask' }), 'thumbs_down');
  assert.equal(gapKindForVote({ rating: -1, messageRoute: null }), 'thumbs_down');
  assert.equal(gapKindForVote({ rating: 1, messageRoute: 'ask' }), null);
});

test('gapKindForVote: a thumbs-down on an unsupported reply adds no second gap', () => {
  assert.equal(gapKindForVote({ rating: -1, messageRoute: 'unsupported' }), null);
});
