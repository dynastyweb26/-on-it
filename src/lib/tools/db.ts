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
  then: Promise<{ data: unknown; error: { message: string } | null }>['then'];
};

export function supabaseToolDb(client: SupabaseClient): ToolDb {
  return {
    async select<T>(table: string, plan: SelectPlan) {
      let query = client.from(table).select(plan.columns) as unknown as LooseQuery;

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

      const { data, error } = await (query as unknown as PromiseLike<{
        data: unknown;
        error: { message: string } | null;
      }>);
      return {
        data: (data ?? null) as T[] | null,
        error: error ? { message: error.message } : null,
      };
    },
  };
}
