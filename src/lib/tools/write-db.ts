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

export function supabaseWriteDb(client: SupabaseClient, userId: string): WriteDb {
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
      // An update must name exactly the row it is allowed to touch. Anything
      // broader than one id is refused before a single query is built, and the
      // same rule applies to any future delete: id plus the caller, nothing else.
      const id = match.eq?.id;
      const named = (typeof id === 'string' && id.trim() !== '')
        || (typeof id === 'number' && Number.isFinite(id));
      if (!named) {
        throw new Error('WriteDb.update refuses to run without a non-empty id in match.eq');
      }

      let query = client.from(table).update(values as never) as unknown as {
        eq(column: string, value: unknown): typeof query;
        is(column: string, value: null): typeof query;
        then: Promise<{ error: { message: string } | null }>['then'];
      };
      for (const [column, value] of Object.entries(match.eq ?? {})) {
        // The scope is the caller's, never something a payload can widen.
        if (column === 'user_id') continue;
        query = query.eq(column, value);
      }
      for (const column of Object.keys(match.is ?? {})) {
        query = query.is(column, null);
      }
      query = query.eq('user_id', userId);
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
