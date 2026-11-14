// History is another owner's data unless RLS says otherwise, so these tests run
// against the real migration in PGlite under each caller's own session: one owner
// with two sessions, and a second owner reusing the first owner's session id.
import test from 'node:test';
import assert from 'node:assert/strict';
import { historyMessages, loadHistory, type HistoryReader, type HistoryRow } from './history';
import { openTestDb, OWNER, OTHER, type TestDb } from './pglite-test-db';

const COLUMNS = 'select user_text, reply_text, created_at from public.chat_messages';

/** The same filtered read the Supabase reader issues, as the caller's session. */
const reader = (db: TestDb, userId: string): HistoryReader => async ({ sessionId, limit }) =>
  db.as(userId, async (q) => (await q.query<HistoryRow>(
    `${COLUMNS} where session_id = $1 order by created_at desc limit $2`,
    [sessionId, limit],
  )).rows);

async function seeded(): Promise<TestDb> {
  const db = await openTestDb();
  // Owner: three turns in "session-a", and one in a different session.
  // Other owner: reuses "session-a" so RLS, not the filter, must separate them.
  await db.seed(`
    insert into public.chat_messages (user_id, session_id, turn, user_text, reply_text, tools_called, created_at) values
      ('${OWNER}', 'session-a', 1, 'who owes me?', 'Two are unpaid, $120.00 in total.', array['unpaid_invoices'], '2026-11-14T10:00:00Z'),
      ('${OWNER}', 'session-a', 2, 'send him a reminder', 'Ready to confirm.', array['send_reminder'], '2026-11-14T10:01:00Z'),
      ('${OWNER}', 'session-a', 3, 'how much did I make?', 'Money in was +$900.00.', array['run_report'], '2026-11-14T10:02:00Z'),
      ('${OWNER}', 'session-b', 1, 'something else entirely', 'Another thread.', array[]::text[], '2026-11-14T10:03:00Z'),
      ('${OTHER}', 'session-a', 1, 'not the owner''s question', 'Not the owner''s answer.', array[]::text[], '2026-11-14T10:04:00Z');
  `);
  return db;
}

test('the caller gets their own turns, oldest first, text only', async () => {
  const db = await seeded();
  try {
    const messages = await loadHistory(reader(db, OWNER), 'session-a');
    assert.deepEqual(messages, [
      { role: 'user', content: 'who owes me?' },
      { role: 'assistant', content: 'Two are unpaid, $120.00 in total.' },
      { role: 'user', content: 'send him a reminder' },
      { role: 'assistant', content: 'Ready to confirm.' },
      { role: 'user', content: 'how much did I make?' },
      { role: 'assistant', content: 'Money in was +$900.00.' },
    ]);
    // Tool names live in the row, not in what the model is told.
    assert.equal(JSON.stringify(messages).includes('unpaid_invoices'), false);
  } finally {
    await db.close();
  }
});

test('another session is never mixed in', async () => {
  const db = await seeded();
  try {
    const messages = await loadHistory(reader(db, OWNER), 'session-b');
    assert.deepEqual(messages, [
      { role: 'user', content: 'something else entirely' },
      { role: 'assistant', content: 'Another thread.' },
    ]);
    assert.equal(JSON.stringify(messages).includes('who owes me?'), false);
  } finally {
    await db.close();
  }
});

test('another owner reusing the same session id is invisible', async () => {
  const db = await seeded();
  try {
    const messages = await loadHistory(reader(db, OWNER), 'session-a');
    assert.equal(JSON.stringify(messages).includes('not the owner'), false);
    const theirs = await loadHistory(reader(db, OTHER), 'session-a');
    assert.deepEqual(theirs, [
      { role: 'user', content: "not the owner's question" },
      { role: 'assistant', content: "Not the owner's answer." },
    ]);
  } finally {
    await db.close();
  }
});

test('a signed-out caller gets no history, not an error', async () => {
  const db = await seeded();
  try {
    const anon: HistoryReader = async ({ sessionId, limit }) => {
      await db.raw.exec('set role anon');
      try {
        const result = await db.raw.query<HistoryRow>(
          `${COLUMNS} where session_id = $1 order by created_at desc limit $2`,
          [sessionId, limit],
        );
        return result.rows;
      } finally {
        await db.raw.exec('reset role');
      }
    };
    assert.deepEqual(await loadHistory(anon, 'session-a'), []);
  } finally {
    await db.close();
  }
});

test('no session, or the logger placeholder, reads nothing', async () => {
  const reads: string[] = [];
  const read: HistoryReader = async ({ sessionId }) => {
    reads.push(sessionId);
    return [];
  };
  assert.deepEqual(await loadHistory(read, null), []);
  assert.deepEqual(await loadHistory(read, '  '), []);
  assert.deepEqual(await loadHistory(read, 'unknown'), []);
  assert.deepEqual(reads, [], 'the database is never asked for a session it cannot trust');
});

test('a failed read is an empty history, never a thrown turn', async () => {
  const read: HistoryReader = async () => {
    throw new Error('permission denied');
  };
  assert.deepEqual(await loadHistory(read, 'session-a'), []);
});

test('a turn without either side of the text is skipped', () => {
  assert.deepEqual(
    historyMessages([
      { user_text: '   ', reply_text: 'orphan answer', created_at: '2026-11-14T10:00:00Z' },
      { user_text: 'a real question', reply_text: null, created_at: '2026-11-14T10:01:00Z' },
    ]),
    [{ role: 'user', content: 'a real question' }],
  );
});
