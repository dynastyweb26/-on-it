// ═══ Test-only: the real migrations in an in-memory Postgres ═══
//
// The tool safety tests must prove RLS, not pattern-match fixtures. This boots
// PGlite, stubs exactly what Supabase provides (the roles, auth.uid(), the
// storage schema 001_init references), then executes the repo's migration files
// AS WRITTEN, in order. Two owners are seeded so "another user's rows" is a real
// database fact.
//
// Not app code: nothing under src/app imports this. Tests do.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import type { SelectPlan, ToolDb } from './contract';
import type { ChatLogRow, ChatLogWriter } from './log';

/** The two owners every RLS test uses. Fixed ids so failures are comparable. */
export const OWNER = '11111111-1111-1111-1111-111111111111';
export const OTHER = '22222222-2222-2222-2222-222222222222';

/**
 * The migrations a tool's read path depends on, in the order production applied
 * them. A tool that reads a new table adds that table's migration here (and its
 * rows to the test), so the RLS proof covers it.
 */
export const TOOL_MIGRATIONS = [
  '001_init.sql',
  '20260915000000_deposit_support.sql',
  '20260916000000_deposits_and_partial_payments.sql',
  '20260905000000_soft_delete.sql',
  '20260918000000_invoice_payments.sql',
  '20261111170000_tool_pending_actions.sql',
  '20261111180000_ai_chat_logging.sql',
] as const;

const read = (name: string): string =>
  readFileSync(new URL(`../../../supabase/migrations/${name}`, import.meta.url), 'utf8');

/** Identifier guard: table and column names come from tool code, never input. */
const ident = (name: string): string => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`unsafe identifier: ${name}`);
  return name;
};

/** A ToolDb that also reports which tables the tool actually read. */
export type RecordingToolDb = ToolDb & { tables: string[] };

export type TestDb = {
  raw: PGlite;
  /** Run `fn` as `userId`, with the authenticated role and RLS applied. */
  as<T>(userId: string, fn: (db: PGlite) => Promise<T>): Promise<T>;
  /** The caller-scoped database a tool handler receives. */
  toolDb(userId: string): RecordingToolDb;
  /** The real chat-log writer, under the caller's own session. */
  chatLog(userId: string): ChatLogWriter;
  /** Owner-side setup (RLS bypassed): seed rows, reset state. */
  seed(sql: string, params?: unknown[]): Promise<void>;
  close(): Promise<void>;
};

/**
 * The Supabase surface the migrations touch. Kept minimal on purpose: if a
 * migration needs something this does not provide, the test fails loudly here
 * instead of quietly proving less.
 */
const SUPABASE_STUBS = `
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
  create function auth.role() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claim.role', true), '')
  $$;
  create schema if not exists storage;
  create table storage.buckets (
    id text primary key,
    name text not null,
    public boolean not null default false
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text,
    name text
  );
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select string_to_array(name, '/')
  $$;
  grant usage on schema public to anon, authenticated, service_role;
  -- Supabase's own default grants: tables created by migrations are reachable
  -- by the client roles, and RLS (never a missing grant) is the boundary.
  alter default privileges in schema public
    grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public
    grant all on sequences to anon, authenticated, service_role;
`;

export async function openTestDb(): Promise<TestDb> {
  const db = new PGlite({ extensions: { pgcrypto } });

  // One connection, one role at a time: calls are serialized so a role switch
  // can never land in the middle of another statement.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T,>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn, fn);
    queue = run.then(() => undefined, () => undefined);
    return run;
  };

  await db.exec(SUPABASE_STUBS);
  for (const file of TOOL_MIGRATIONS) await db.exec(read(file));

  // Two owners. profiles.business_name is required by 001_init.
  await db.exec(`
    insert into auth.users (id) values ('${OWNER}'), ('${OTHER}');
    insert into public.profiles (id, business_name)
      values ('${OWNER}', 'Owner Co'), ('${OTHER}', 'Other Owner Ltd');
  `);

  const as: TestDb['as'] = (userId, fn) =>
    serial(async () => {
      await db.exec("set role authenticated");
      try {
        await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
        return await fn(db);
      } finally {
        await db.query("select set_config('request.jwt.claim.sub', '', false)");
        await db.exec('reset role');
      }
    });

  const toolDb: TestDb['toolDb'] = (userId) => {
    const tables: string[] = [];
    return {
      tables,
      async select<T>(table: string, plan: SelectPlan) {
        tables.push(table);
        return as(userId, async () => {
          try {
            return await selectWithPlan<T>(db, table, plan);
          } catch (e) {
            return { data: null, error: { message: (e as Error).message } };
          }
        });
      },
    };
  };

  const chatLog = (userId: string): ChatLogWriter => ({
    insert: (row: ChatLogRow) =>
      as(userId, async () => {
        await db.query(
          `insert into public.chat_messages
             (user_id, session_id, turn, user_text, reply_text, tools_called, template_id, input_tokens, output_tokens)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [row.userId, row.sessionId, row.turn, row.userText, row.replyText,
            row.toolsCalled, row.templateId, row.inputTokens, row.outputTokens],
        );
      }),
  });

  const seed = async (sql: string, params: unknown[] = []) => {
    await serial(async () => {
      await db.query(sql, params);
    });
  };

  return { raw: db, as, toolDb, chatLog, seed, close: () => db.close() };
}

/**
 * The same filtered select `supabaseToolDb` issues, expressed as SQL. Only the
 * plan's `eq`, `is`, `in`, `order` and `limit` are honoured — the whole SelectPlan.
 */
async function selectWithPlan<T>(
  db: PGlite,
  table: string,
  plan: SelectPlan,
): Promise<{ data: T[] | null; error: { message: string } | null }> {
  const params: unknown[] = [];
  const where: string[] = [];

  for (const [column, value] of Object.entries(plan.eq ?? {})) {
    params.push(value);
    where.push(`${ident(column)} = $${params.length}`);
  }
  for (const column of Object.keys(plan.is ?? {})) {
    where.push(`${ident(column)} is null`);
  }
  for (const [column, values] of Object.entries(plan.in ?? {})) {
    params.push(values);
    where.push(`${ident(column)} = any($${params.length})`);
  }

  let sql = `select ${plan.columns} from public.${ident(table)}`;
  if (where.length) sql += ` where ${where.join(' and ')}`;
  if (plan.order) {
    sql += ` order by ${ident(plan.order.column)} ${plan.order.ascending === false ? 'desc' : 'asc'} nulls last`;
  }
  if (plan.limit != null) sql += ` limit ${Math.trunc(plan.limit)}`;

  const { rows } = await db.query<T>(sql, params);
  return { data: rows, error: null };
}
