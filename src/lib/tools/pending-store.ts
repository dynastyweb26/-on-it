// The Supabase-backed PendingStore: written under the CALLER'S session, never
// the service role. RLS on tool_pending_actions / tool_action_commits is what
// keeps one owner's tokens out of another owner's reach.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PendingAction, PendingStore, RecordedCommit } from './confirm';

export function supabasePendingStore(client: SupabaseClient, userId: string): PendingStore {
  return {
    async insert(action: PendingAction) {
      const { error } = await client.from('tool_pending_actions').insert({
        id: action.id,
        user_id: userId,
        tool: action.tool,
        args: action.args,
        token_hash: action.tokenHash,
        created_at: action.createdAt,
        expires_at: action.expiresAt,
      });
      if (error) throw new Error(error.message);
    },

    async findByTokenHash(ownerId: string, tokenHash: string) {
      const { data, error } = await client
        .from('tool_pending_actions')
        .select('id, user_id, tool, args, token_hash, created_at, expires_at, executed_at')
        .eq('user_id', ownerId)
        .eq('token_hash', tokenHash)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return {
        id: data.id as string,
        userId: data.user_id as string,
        tool: data.tool as string,
        args: data.args,
        tokenHash: data.token_hash as string,
        createdAt: data.created_at as string,
        expiresAt: data.expires_at as string,
        executedAt: (data.executed_at as string | null) ?? null,
      };
    },

    async markExecuted(ownerId: string, actionId: string) {
      const { error } = await client
        .from('tool_pending_actions')
        .update({ executed_at: new Date().toISOString() })
        .eq('user_id', ownerId)
        .eq('id', actionId)
        .is('executed_at', null);
      if (error) throw new Error(error.message);
    },

    async findCommit(ownerId: string, idempotencyKey: string) {
      const { data, error } = await client
        .from('tool_action_commits')
        .select('result')
        .eq('user_id', ownerId)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? (data.result as RecordedCommit) : null;
    },

    async insertCommit(ownerId: string, idempotencyKey: string, commit: RecordedCommit) {
      // The unique (user_id, idempotency_key) index is the real guarantee: a
      // racing duplicate fails here, and confirmActions re-reads and returns it.
      const { error } = await client
        .from('tool_action_commits')
        .insert({ user_id: ownerId, idempotency_key: idempotencyKey, result: commit });
      if (error) throw new Error(error.message);
    },
  };
}
