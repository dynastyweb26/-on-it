// A fixture-backed ToolDb. Same contract as the Supabase one, so a tool runs
// unchanged against seeded rows — that is what makes the shared safety suite and
// the eval runner deterministic, free and offline (no database, no network).
//
// Anything a tool tries to write is counted, not performed: a read tool that
// somehow writes shows up as a failed safety check instead of a surprise.
import type { SelectPlan, ToolDb } from './contract';

export type FixtureRow = Record<string, unknown>;
export type FixtureRows = Record<string, readonly FixtureRow[]>;

export type FixtureDb = ToolDb & {
  /** Writes attempted by any tool. Must stay 0 for read tools. */
  attempts: number;
  /** The rows as they stand after the turn, for state grading. */
  rows: FixtureRows;
};

const matches = (row: FixtureRow, plan: SelectPlan): boolean => {
  for (const [column, value] of Object.entries(plan.eq ?? {})) {
    if (row[column] !== value) return false;
  }
  for (const column of Object.keys(plan.is ?? {})) {
    if (row[column] != null) return false;
  }
  for (const [column, values] of Object.entries(plan.in ?? {})) {
    if (!values.includes(row[column] as string | number)) return false;
  }
  return true;
};

const compare = (a: unknown, b: unknown): number => {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
};

export function fixtureDb(rows: FixtureRows = {}): FixtureDb {
  // A case that declares no fixture data is an empty account, not a crash:
  // Object.entries(undefined) used to take the whole eval run down.
  const state: FixtureRows = Object.fromEntries(
    Object.entries(rows ?? {}).map(([table, tableRows]) => [table, tableRows.map((row) => ({ ...row }))]),
  );
  let attempts = 0;

  const db: FixtureDb = {
    get attempts() {
      return attempts;
    },
    rows: state,
    async select<T>(table: string, plan: SelectPlan) {
      const tableRows = state[table];
      if (!tableRows) return { data: [] as T[], error: null };

      let out = tableRows.filter((row) => matches(row, plan));
      if (plan.order) {
        const { column, ascending = true } = plan.order;
        out = [...out].sort((a, b) => (ascending ? 1 : -1) * compare(a[column], b[column]));
      }
      if (plan.limit != null) out = out.slice(0, plan.limit);

      // Only the asked-for columns, like PostgREST.
      const columns = plan.columns.split(',').map((c) => c.trim()).filter(Boolean);
      const projected = columns.includes('*')
        ? out.map((row) => ({ ...row }))
        : out.map((row) => Object.fromEntries(columns.map((c) => [c, row[c] ?? null])));

      return { data: projected as T[], error: null };
    },
  };

  // A tool has no write method at all; if one is ever added to ToolDb this
  // counter is where it must land.
  Object.defineProperty(db, 'attempts', { get: () => attempts });
  void attempts;
  return db;
}
