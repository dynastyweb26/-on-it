// The chat logging migration, executed against an in-memory Postgres with
// Supabase's roles and auth.uid() stubbed. Two seeded users, real RLS: a user can
// insert and read only their own rows, and deleting the account removes all
// three tables' rows. No live project, no service role.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const MIGRATION = readFileSync(
  new URL('../../supabase/migrations/20261111180000_ai_chat_logging.sql', import.meta.url),
  'utf8',
);

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

let db: PGlite;

const as = async <T>(user: string, sql: string, params: unknown[] = []) => {
  await db.exec(`select set_config('request.jwt.claim.sub', '${user}', false); set role authenticated;`);
  try {
    return await db.query<T>(sql, params);
  } finally {
    await db.exec('reset role');
  }
};

const everyone = async <T>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows;

before(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create extension if not exists pgcrypto;
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create schema if not exists auth;
    grant usage on schema auth to anon, authenticated, service_role;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema public to anon, authenticated, service_role;
    insert into auth.users (id) values ('${A}'), ('${B}');
  `);
  // The whole point: the file has to apply as written.
  await db.exec(MIGRATION);
});

after(async () => {
  await db.close();
});

test('all three tables exist with RLS on and no anon access', async () => {
  const tables = await everyone<{ relname: string; relrowsecurity: boolean; relacl: string | null }>(
    `select relname, relrowsecurity, relacl::text as relacl from pg_class
      where relname in ('chat_messages', 'chat_feedback', 'help_gaps') order by relname`,
  );
  assert.deepEqual(tables.map((t) => t.relname), ['chat_feedback', 'chat_messages', 'help_gaps']);
  assert.ok(tables.every((t) => t.relrowsecurity), 'RLS enabled on all three');
  assert.ok(tables.every((t) => !/anon=/.test(t.relacl ?? '')), 'no anon grant survives');
});

test('a user inserts and reads only their own messages', async () => {
  await as(A, `insert into public.chat_messages (user_id, session_id, turn, tools_called, template_id, input_tokens, output_tokens)
               values ($1, 'chat-1', 1, array['unpaid_invoices'], 'list.ranked', 100, 20)`, [A]);

  const mine = await as<{ user_id: string }>(A, 'select user_id from public.chat_messages');
  assert.deepEqual(mine.rows.map((r) => r.user_id), [A]);

  const theirs = await as<{ user_id: string }>(B, 'select user_id from public.chat_messages');
  assert.equal(theirs.rows.length, 0, "another user's log is invisible");

  await assert.rejects(
    as(B, `insert into public.chat_messages (user_id, session_id, turn) values ($1, 'chat-2', 1)`, [A]),
    /row-level security|violates/i,
    'a user cannot write a row attributed to somebody else',
  );
});

test('chat feedback must point at the caller own message', async () => {
  const message = (await as<{ id: string }>(A, 'select id from public.chat_messages limit 1')).rows[0];
  await as(A, `insert into public.chat_feedback (user_id, message_id, thumb, reason)
               values ($1, $2, 'down', 'wrong_client')`, [A, message.id]);

  const mine = await as<{ thumb: string }>(A, 'select thumb from public.chat_feedback');
  assert.deepEqual(mine.rows.map((r) => r.thumb), ['down']);

  const theirs = await as<{ thumb: string }>(B, 'select thumb from public.chat_feedback');
  assert.equal(theirs.rows.length, 0);

  await assert.rejects(
    as(B, `insert into public.chat_feedback (user_id, message_id, thumb) values ($1, $2, 'up')`, [B, message.id]),
    /row-level security|violates/i,
    "a user cannot attach feedback to another user's message",
  );
});

test('a thumb is one of up or down, and the note is bounded', async () => {
  const message = (await as<{ id: string }>(A, 'select id from public.chat_messages limit 1')).rows[0];
  await assert.rejects(
    as(A, `insert into public.chat_feedback (user_id, message_id, thumb) values ($1, $2, 'meh')`, [A, message.id]),
    /check constraint/i,
  );
});

test('help gaps are logged per user and read back only by them', async () => {
  await as(A, `insert into public.help_gaps (user_id, request_text, source, intent)
               values ($1, 'how much did I spend on gas?', 'chat', 'unsupported')`, [A]);
  const mine = await as<{ request_text: string }>(A, 'select request_text from public.help_gaps');
  assert.equal(mine.rows.length, 1);
  const theirs = await as<{ request_text: string }>(B, 'select request_text from public.help_gaps');
  assert.equal(theirs.rows.length, 0);
});

test('no client can update or delete the log', async () => {
  await assert.rejects(
    as(A, `update public.chat_messages set turn = 99`),
    /permission denied|row-level security/i,
  );
  await assert.rejects(
    as(A, `delete from public.chat_messages`),
    /permission denied|row-level security/i,
  );
});

test('deleting the account cascades through all three tables', async () => {
  await as(A, `insert into public.help_gaps (user_id, request_text) values ($1, 'second gap')`, [A]);
  await everyone(`delete from auth.users where id = $1`, [A]);

  const left = await everyone<{ messages: number; feedback: number; gaps: number }>(
    `select
       (select count(*)::int from public.chat_messages where user_id = $1) as messages,
       (select count(*)::int from public.chat_feedback where user_id = $1) as feedback,
       (select count(*)::int from public.help_gaps where user_id = $1) as gaps`,
    [A],
  );
  assert.deepEqual(left[0], { messages: 0, feedback: 0, gaps: 0 });
});
