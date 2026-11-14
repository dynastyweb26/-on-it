// The Supabase-backed WriteDb: the ONLY way a confirmed action changes a row.
//
// Built from the caller's own session client, so RLS is the boundary: an insert,
// an update or an rpc can only touch rows the owner may touch. There is no
// service role here, and CI proves no read tool or model turn can even import
// this module (scripts/ci/tool-imports.ts).
//
// Only /api/ai/confirm constructs one, and only after it has authenticated the
// caller and validated the token.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SelectPlan, ToolDb, WriteDb, WriteMatch } from './contract';
import { supabaseToolDb } from './db';

export function supabaseWriteDb(client: SupabaseClient): WriteDb {
  const read: ToolDb = supabaseToolDb(client);

  return {
    select<T>(table: string, plan: SelectPlan) {
      return read.select<T>(table, plan);
    },

    async insert(table, values) {
      // Supabase's generated types do not know these tables' shapes; the values
      // come from a tool's prepared resolved payload, never from the model.
      const { error } = await client.from(table).insert(values as never);
      return { error: error ? { message: error.message } : null };
    },

    async update(table, values, match: WriteMatch) {
      let query = client.from(table).update(values as never) as unknown as {
        eq(column: string, value: unknown): typeof query;
        is(column: string, value: null): typeof query;
        then: Promise<{ error: { message: string } | null }>['then'];
      };
      for (const [column, value] of Object.entries(match.eq ?? {})) {
        query = query.eq(column, value);
      }
      for (const column of Object.keys(match.is ?? {})) {
        query = query.is(column, null);
      }
      const { error } = await query;
      return { error: error ? { message: error.message } : null };
    },

    async rpc<T>(fn: string, args: Record<string, unknown>) {
      const { data, error } = await client.rpc(fn, args as never);
      return {
        data: (data ?? null) as T | null,
        error: error ? { message: error.message } : null,
      };
    },
  };
}
