// ═══ AI Smart · chat logging ═══
//
// One row per AI turn in chat_messages: which turn, which tools were called,
// which chat card the result used, and the token counts the API already reports.
// Written under the CALLER'S session (RLS: insert and read own rows only), never
// the service role.
//
// A failed log never fails a turn: the user's answer matters more than our
// analytics, and the failure is logged where an operator can see it.
import type { SupabaseClient } from '@supabase/supabase-js';

export type ChatLogRow = {
  userId: string;
  sessionId: string;
  turn: number;
  toolsCalled: string[];
  templateId: string | null;
  inputTokens: number;
  outputTokens: number;
};

export interface ChatLogWriter {
  insert(row: ChatLogRow): Promise<void>;
}

export function supabaseChatLog(client: SupabaseClient): ChatLogWriter {
  return {
    async insert(row: ChatLogRow) {
      const { error } = await client.from('chat_messages').insert({
        user_id: row.userId,
        session_id: row.sessionId,
        turn: row.turn,
        tools_called: row.toolsCalled,
        template_id: row.templateId,
        input_tokens: row.inputTokens,
        output_tokens: row.outputTokens,
      });
      if (error) throw new Error(error.message);
    },
  };
}

/** Best effort by design. Returns whether the row landed, never throws. */
export async function logTurn(writer: ChatLogWriter, row: ChatLogRow): Promise<boolean> {
  try {
    await writer.insert({
      ...row,
      sessionId: row.sessionId.slice(0, 120) || 'unknown',
      turn: Math.max(1, Math.trunc(row.turn)),
      toolsCalled: row.toolsCalled.slice(0, 20),
    });
    return true;
  } catch (e) {
    console.error('[chat-log] turn not recorded', (e as Error)?.message);
    return false;
  }
}

/** The session the chat thread sent, or the turn id, or a neutral placeholder. */
export function sessionFrom(headers: Headers): string {
  const explicit = headers.get('x-chat-session')?.trim();
  if (explicit) return explicit.slice(0, 120);
  const turnId = headers.get('x-turn-id')?.trim();
  if (turnId) return turnId.slice(0, 120);
  return 'unknown';
}

/** Which turn of the thread this is; the client sends it, 1 is the safe default. */
export function turnIndexFrom(headers: Headers): number {
  const raw = Number(headers.get('x-turn-index'));
  return Number.isFinite(raw) && raw >= 1 ? Math.trunc(raw) : 1;
}
