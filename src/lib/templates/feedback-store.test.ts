// The thumbs follow-up's writes: chip labels map to the six stored values, the
// vote is validated before it is sent, and one message keeps exactly one row
// through save, change and clear — proven in PGlite against the real migration.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseFeedbackStore } from './feedback-store';
import {
  FEEDBACK_CHIPS,
  FEEDBACK_REASONS,
  reasonForChip,
  reasonsForChips,
} from './reasons';
import { OWNER, OTHER, openTestDb, type TestDb } from '@/lib/tools/pglite-test-db';

test('the design chips map to the six stored values', () => {
  assert.deepEqual(FEEDBACK_CHIPS.map((c) => c.label), [
    'Wrong number',
    'Wrong person or record',
    "Didn't understand",
    "Couldn't do it",
    'Too slow',
    'Other',
  ]);
  assert.deepEqual(FEEDBACK_CHIPS.map((c) => c.reason), [...FEEDBACK_REASONS]);
  assert.equal(reasonForChip('Wrong number'), 'wrong_number');
  assert.equal(reasonForChip('Wrong person or record'), 'wrong_record');
  assert.equal(reasonForChip("Didn't understand"), 'didnt_understand');
  assert.equal(reasonForChip("Couldn't do it"), 'couldnt_do_it');
  assert.equal(reasonForChip('Too slow'), 'too_slow');
  assert.equal(reasonForChip('Other'), 'other');
  assert.equal(reasonForChip('wrong number'), null);
  assert.equal(reasonForChip('Something else'), null);
});

test('picked chips become stored reasons, deduped, and a typo is refused', () => {
  assert.deepEqual(reasonsForChips(['Wrong number', 'Too slow']), ['wrong_number', 'too_slow']);
  assert.deepEqual(reasonsForChips(['Other', 'Other']), ['other']);
  assert.throws(() => reasonsForChips(['Wrong phone']), /unknown feedback chip/);
});

function fakeClient() {
  const upserts: { row: Record<string, unknown>; options: unknown }[] = [];
  const deletes: { user_id?: unknown; message_id?: unknown }[] = [];
  const client = {
    from(table: string) {
      assert.equal(table, 'chat_feedback');
      return {
        upsert(row: Record<string, unknown>, options: unknown) {
          upserts.push({ row, options });
          return Promise.resolve({ error: null });
        },
        delete() {
          const filters: Record<string, unknown> = {};
          const chain = {
            eq(column: string, value: unknown) {
              filters[column] = value;
              if (column === 'message_id') {
                deletes.push({ ...filters });
                return Promise.resolve({ error: null });
              }
              return chain;
            },
          };
          return chain;
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, upserts, deletes };
}

test('saving a vote writes the caller id, the message and the stored reasons', async () => {
  const { client, upserts } = fakeClient();
  await supabaseFeedbackStore(client, OWNER).save({
    messageId: 'm1',
    thumb: 'down',
    reasons: ['wrong_record', 'too_slow'],
    note: '  it used last month  ',
  });
  assert.deepEqual(upserts[0], {
    row: {
      user_id: OWNER,
      message_id: 'm1',
      thumb: 'down',
      reasons: ['wrong_record', 'too_slow'],
      note: 'it used last month',
    },
    options: { onConflict: 'user_id,message_id' },
  });
});

test('changing the vote targets the same row; empty reasons and note are null', async () => {
  const { client, upserts } = fakeClient();
  const store = supabaseFeedbackStore(client, OWNER);
  await store.save({ messageId: 'm1', thumb: 'down', reasons: ['other'] });
  await store.save({ messageId: 'm1', thumb: 'up' });
  assert.equal(upserts.length, 2);
  assert.deepEqual(upserts[1].row, {
    user_id: OWNER,
    message_id: 'm1',
    thumb: 'up',
    reasons: null,
    note: null,
  });
  for (const u of upserts) {
    assert.deepEqual(u.options, { onConflict: 'user_id,message_id' });
  }
});

test('an unknown reason or an over-long note never reaches the database', async () => {
  const { client, upserts } = fakeClient();
  const store = supabaseFeedbackStore(client, OWNER);
  await assert.rejects(
    store.save({ messageId: 'm1', thumb: 'down', reasons: ['because' as never] }),
  );
  await assert.rejects(
    store.save({ messageId: 'm1', thumb: 'up', note: 'x'.repeat(1001) }),
    /max 1000/,
  );
  assert.equal(upserts.length, 0);
});

test('clearing deletes only the caller own row for that message', async () => {
  const { client, deletes } = fakeClient();
  await supabaseFeedbackStore(client, OWNER).clear('m1');
  assert.deepEqual(deletes, [{ user_id: OWNER, message_id: 'm1' }]);
});

test('a store without a session is refused', () => {
  const { client } = fakeClient();
  assert.throws(() => supabaseFeedbackStore(client, ''), /caller session/);
});

// ── Real Postgres: the unique key is the one-row guarantee ─────────────────
let db: TestDb;

before(async () => {
  db = await openTestDb();
});

after(async () => {
  await db.close();
});

test('save, change and clear leave at most one row per message', async () => {
  const message = await db.as(OWNER, (q) =>
    q.query<{ id: string }>(
      `insert into public.chat_messages (user_id, session_id, turn, user_text)
       values ($1, 'chat-1', 1, 'where is my money?') returning id`,
      [OWNER],
    ),
  );
  const messageId = message.rows[0].id;

  const upsert = (thumb: string, reasons: string[] | null) =>
    db.as(OWNER, (q) =>
      q.query(
        `insert into public.chat_feedback (user_id, message_id, thumb, reasons)
         values ($1, $2, $3, $4)
         on conflict (user_id, message_id)
         do update set thumb = excluded.thumb, reasons = excluded.reasons`,
        [OWNER, messageId, thumb, reasons],
      ),
    );

  await upsert('down', ['wrong_number']);
  await upsert('up', null);

  const rows = await db.as(OWNER, (q) =>
    q.query<{ thumb: string; reasons: string[] | null }>(
      'select thumb, reasons from public.chat_feedback where message_id = $1',
      [messageId],
    ),
  );
  assert.equal(rows.rows.length, 1, 'one row per message');
  assert.equal(rows.rows[0].thumb, 'up');
  assert.equal(rows.rows[0].reasons, null);

  // Another owner cannot see it, let alone change it.
  const theirs = await db.as(OTHER, (q) =>
    q.query('select id from public.chat_feedback where message_id = $1', [messageId]),
  );
  assert.equal(theirs.rows.length, 0);

  await db.as(OWNER, (q) =>
    q.query('delete from public.chat_feedback where message_id = $1', [messageId]),
  );
  const left = await db.as(OWNER, (q) => q.query('select id from public.chat_feedback'));
  assert.equal(left.rows.length, 0);
});
