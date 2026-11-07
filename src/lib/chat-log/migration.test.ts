import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/migrations/20261106100000_ai_chat_logging.sql', 'utf8');
// Statements only: the header and verification comments are prose.
const code = sql
  .split(/\r?\n/)
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n');

test('creates exactly the three tables, with RLS on each', () => {
  for (const t of ['chat_messages', 'chat_feedback', 'help_gaps']) {
    assert.match(code, new RegExp(`create table if not exists public\\.${t} `));
    assert.match(code, new RegExp(`alter table public\\.${t}\\s+enable row level security`));
  }
  assert.equal((code.match(/create table/g) ?? []).length, 3);
});

test('is additive: nothing is dropped, renamed or altered beyond enabling RLS', () => {
  assert.ok(!/\bdrop (table|column|constraint|index)\b/i.test(code));
  assert.ok(!/rename/i.test(code));
  const alters = code.match(/alter table [^\n]+/gi) ?? [];
  assert.equal(alters.length, 3);
  for (const a of alters) assert.match(a, /enable row level security/i);
});

test('the vote key is a plain UNIQUE constraint, never a partial index', () => {
  assert.match(code, /constraint chat_feedback_user_message_key unique \(user_id, message_id\)/);
  assert.ok(!/create unique index/i.test(code));
  assert.ok(!/unique[^;]*\bwhere\b/i.test(code));
});

test('rating is -1 or 1 only', () => {
  assert.match(code, /rating\s+smallint not null check \(rating in \(-1, 1\)\)/);
});

test('no column can hold the rows a tool returned', () => {
  const messages = code.slice(code.indexOf('create table if not exists public.chat_messages'), code.indexOf('create table if not exists public.chat_feedback'));
  assert.match(messages, /tool_name\s+text/);
  assert.match(messages, /tool_row_count\s+integer/);
  assert.ok(!/\b(jsonb|json)\b/i.test(messages));
  assert.ok(!/tool_(rows|result|output|payload)\b/i.test(messages));
});

test('default grants are revoked from anon and authenticated, then granted explicitly', () => {
  for (const t of ['chat_messages', 'chat_feedback', 'help_gaps']) {
    assert.match(code, new RegExp(`revoke all on public\\.${t}\\s+from anon, authenticated`));
  }
  assert.match(code, /grant select, insert on public\.chat_messages to authenticated/);
  assert.match(code, /grant select, insert on public\.help_gaps to authenticated/);
  assert.match(code, /grant select, insert, delete on public\.chat_feedback to authenticated/);
  assert.match(code, /grant update \(user_id, message_id, rating, reason\) on public\.chat_feedback to authenticated/);
  // Nothing is ever granted to anon, and no table-level UPDATE anywhere.
  assert.ok(!/to anon/i.test(code.replace(/from anon, authenticated/g, '')));
  assert.ok(!/grant (all|update|delete|truncate)\b[^(]*on public\.(chat_messages|help_gaps)/i.test(code));
  assert.ok(!/grant update on/i.test(code));
});

test('policies are owner-only, and feedback/gaps are pinned to the caller\'s own message', () => {
  const policies = code.match(/create policy "[^"]+" on public\.\w+\s+for (\w+)/g) ?? [];
  const byTable = (t: string) => policies.filter((p) => p.includes(`public.${t}`)).map((p) => p.split(/for /)[1]).sort();
  assert.deepEqual(byTable('chat_messages'), ['insert', 'select']);
  assert.deepEqual(byTable('chat_feedback'), ['delete', 'insert', 'select', 'update']);
  assert.deepEqual(byTable('help_gaps'), ['insert', 'select']);
  assert.ok(!/using \(true\)|with check \(true\)/i.test(code));
  const fbInsert = code.slice(code.indexOf('create policy "own chat feedback insert"'), code.indexOf('drop policy if exists "own chat feedback update"'));
  assert.match(fbInsert, /m\.user_id = auth\.uid\(\)/);
  assert.match(fbInsert, /m\.role = 'assistant'/);
});

test('every user_id cascades from profiles, so account deletion needs no code', () => {
  assert.equal((code.match(/user_id\s+uuid not null references public\.profiles\(id\) on delete cascade/g) ?? []).length, 3);
});

test('the privilege check has rows BG1-BG4 for these tables, and the runner requires them', () => {
  const check = readFileSync('supabase/snippets/privilege_check.sql', 'utf8');
  const required = readFileSync('scripts/lib/privcheck-result.mjs', 'utf8');
  for (const id of ['BG1', 'BG2', 'BG3', 'BG4']) {
    assert.ok(check.includes(`select '${id} `), `${id} missing from the SQL`);
    assert.ok(required.includes(`'${id}'`), `${id} missing from REQUIRED_CHECKS`);
  }
  for (const t of ['chat_messages', 'chat_feedback', 'help_gaps']) assert.ok(check.includes(`public.${t}`));
});
