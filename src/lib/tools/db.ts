// The Supabase-backed ToolDb: the ONLY database surface a tool handler sees.
//
// It is built from the caller's own session client, so RLS is the boundary. It
// exposes one operation (a filtered select) on purpose — tools cannot reach a
// table the plan does not name, and no tool can import the service role (the CI
// check in scripts/ci/no-admin-client-in-tools.mjs proves that).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SelectPlan, ToolDb } from './contract';

type LooseQuery = {
  eq(column: string, value: unknown): LooseQuery;
  is(column: string, value: null): LooseQuery;
  in(column: string, values: readonly (string | number)[]): LooseQuery;
  order(column: string, options: { ascending: boolean; nullsFirst?: boolean }): LooseQuery;
  limit(count: number): LooseQuery;
  range(from: number, to: number): LooseQuery;
  then: Promise<{ data: unknown; error: { message: string } | null; count?: number | null }>['then'];
};

/** PostgREST caps a response; Tools must not inherit that silent cap. */
const PAGE_SIZE = 1000;

export function supabaseToolDb(client: SupabaseClient): ToolDb {
  return {
    async select<T>(table: string, plan: SelectPlan) {
      const build = (count: boolean) => {
        let query = client.from(table).select(
          plan.columns,
          count ? { count: 'exact' } : undefined,
        ) as unknown as LooseQuery;

        for (const [column, value] of Object.entries(plan.eq ?? {})) {
          query = query.eq(column, value);
        }
        for (const column of Object.keys(plan.is ?? {})) {
          query = query.is(column, null);
        }
        for (const [column, values] of Object.entries(plan.in ?? {})) {
          query = query.in(column, values);
        }
        if (plan.order) {
          query = query.order(plan.order.column, {
            ascending: plan.order.ascending !== false,
            // An invoice with no due date belongs after the ones that have one.
            nullsFirst: false,
          });
        }
        if (plan.limit != null) query = query.limit(plan.limit);
        return query;
      };

      if (plan.limit != null) {
        const { data, error } = await build(false);
        return {
          data: (data ?? null) as T[] | null,
          error: error ? { message: error.message } : null,
        };
      }

      // Page by range until the exact count is reached. A short page with rows
      // still missing means the server capped us below PAGE_SIZE: fail loudly.
      const rows: unknown[] = [];
      let total: number | null = null;
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error, count } = await build(true).range(from, from + PAGE_SIZE - 1);
        if (error) return { data: null, error: { message: error.message } };
        if (typeof count === 'number') total = count;
        const page = (data as unknown[] | null) ?? [];
        rows.push(...page);
        if (total !== null && rows.length >= total) break;
        if (page.length < PAGE_SIZE) break;
      }

      if (total !== null && rows.length < total) {
        return {
          data: null,
          error: {
            message: `select ${table} was cut off at ${rows.length} of ${total} rows`,
          },
        };
      }
      return { data: rows as T[], error: null };
    },
  };
}
