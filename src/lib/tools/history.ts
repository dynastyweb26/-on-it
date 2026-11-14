// ═══ AI Smart · the caller's own last turns, as context ═══
//
// "Send him a reminder" only means something after "who owes me?". This module
// reads the caller's last turns in the CURRENT chat session and hands them to the
// model as earlier messages, oldest first.
//
// Two limits are structural, not cosmetic:
//   * ownership is RLS. The query filters by session only; the client is the
//     caller's own session client, so another owner's rows can never come back.
//   * contents are text only: user_text and reply_text. Tool payloads and tool
//     names stay out, so no card data is replayed to the model as truth.
//
// A failed read is a turn without memory, never a failed answer.
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';

/** How many earlier exchanges the model sees. */
export const HISTORY_TURNS = 3;

/** One logged turn, as chat_messages holds it. */
export type HistoryRow = {
  user_text: string;
  reply_text: string | null;
  created_at: string;
};

/** What this module asks the database for: one session, newest first, capped. */
export type HistoryQuery = { sessionId: string; limit: number };

export type HistoryReader = (query: HistoryQuery) => Promise<readonly HistoryRow[] | null | undefined>;

/** The caller's own session client: RLS decides whose rows these are. */
export function supabaseHistoryReader(client: SupabaseClient): HistoryReader {
  return async ({ sessionId, limit }) => {
    const { data, error } = await client
      .from('chat_messages')
      .select('user_text, reply_text, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as HistoryRow[];
  };
}

/**
 * The turns as model messages, oldest first: the question, then the answer when
 * the server composed one. A blank either side is skipped, never sent empty.
 */
export function historyMessages(rows: readonly HistoryRow[]): Anthropic.MessageParam[] {
  const kept = [...rows]
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    .slice(-HISTORY_TURNS);

  const messages: Anthropic.MessageParam[] = [];
  for (const row of kept) {
    const asked = row.user_text.trim();
    if (!asked) continue;
    messages.push({ role: 'user', content: asked });
    const said = row.reply_text?.trim();
    if (said) messages.push({ role: 'assistant', content: said });
  }
  return messages;
}

/**
 * The earlier messages for this session, or none. A missing session (the client
 * did not name one), a signed-out caller and a read failure all answer [].
 */
export async function loadHistory(
  read: HistoryReader,
  sessionId: string | null | undefined,
): Promise<Anthropic.MessageParam[]> {
  const session = sessionId?.trim();
  // "unknown" is the logger's placeholder, not a session: rows from every
  // session share it, so it is never read as one conversation.
  if (!session || session === 'unknown') return [];

  try {
    const rows = await read({ sessionId: session, limit: HISTORY_TURNS });
    return historyMessages(rows ?? []);
  } catch (e) {
    console.error('[ask] history not loaded', (e as Error)?.message);
    return [];
  }
}
