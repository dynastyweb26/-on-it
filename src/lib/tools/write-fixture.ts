// An in-memory WriteDb for the shared safety suite: same contract as the
// Supabase one, rows in memory, every write counted so "wrote exactly one row"
// is a number, not an opinion.
//
// Not app code: nothing under src/app imports this. Tests do.
import { fixtureDb, type FixtureDb, type FixtureRow, type FixtureRows } from './fixture-db';
import type { SelectPlan, WriteDb, WriteMatch } from './contract';

export type FixtureWriteDb = WriteDb & {
  /** The rows as they stand after the writes. */
  rows: FixtureRows;
  inserts: number;
  updates: number;
  rpcs: number;
  /** Every insert, update and rpc together: the one number a write test needs. */
  writes: number;
};

const matches = (row: FixtureRow, match: WriteMatch): boolean => {
  for (const [column, value] of Object.entries(match.eq ?? {})) {
    if (row[column] !== value) return false;
  }
  for (const column of Object.keys(match.is ?? {})) {
    if (row[column] != null) return false;
  }
  return true;
};

/**
 * The writes the app can make today, simulated honestly:
 * save_client inserts a clients row for the caller (the real RPC derives the
 * owner from auth.uid(), so the fixture takes it as an argument).
 */
export function fixtureWriteDb(rows: FixtureRows = {}, userId = ''): FixtureWriteDb {
  const read: FixtureDb = fixtureDb(rows);
  const state: FixtureRows = read.rows;
  let inserts = 0;
  let updates = 0;
  let rpcs = 0;

  const db: FixtureWriteDb = {
    rows: state,
    get inserts() { return inserts; },
    get updates() { return updates; },
    get rpcs() { return rpcs; },
    get writes() { return inserts + updates + rpcs; },
    select<T>(table: string, plan: SelectPlan) {
      return read.select<T>(table, plan);
    },
    async insert(table, values) {
      inserts += 1;
      state[table] = [...(state[table] ?? []), { ...values }];
      return { error: null };
    },
    async update(table, values, match) {
      updates += 1;
      state[table] = (state[table] ?? []).map((row) =>
        matches(row, match) ? { ...row, ...values } : row);
      return { error: null };
    },
    async rpc<T>(fn: string, args: Record<string, unknown>) {
      rpcs += 1;
      if (fn !== 'save_client') {
        return { data: null, error: { message: `unknown rpc ${fn}` } };
      }
      const id = `cli-${(state.clients?.length ?? 0) + 1}`;
      const name = String(args.p_name ?? '').trim();
      state.clients = [
        ...(state.clients ?? []),
        {
          id,
          user_id: userId,
          name,
          phone: args.p_phone ?? null,
          email: args.p_email ?? null,
          deleted_at: null,
        },
      ];
      return { data: [{ id, linked: 0 }] as T, error: null };
    },
  };
  return db;
}
