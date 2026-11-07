// ═══ AI chat log · the writers ═══
//
// Every write runs under the caller's own session (a user-scoped client, RLS
// on): there is no service-role client here. Logging must NEVER break an
// answer, so each function catches everything, logs the database's code and
// message (never the text: it carries what the user typed) and reports false.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildTurnRows,
  MAX_QUESTION,
  capText,
  type GapKind,
  type TurnInput,
} from './rows';

type Db = Pick<SupabaseClient, 'from'>;

/** A database error result: its code and message (never its `details`, which can echo a row). */
function report(where: string, error: unknown): void {
  const e = error as { code?: string; message?: string } | null;
  console.error(`[chat-log] ${where} failed`, { code: e?.code, message: e?.message });
}

/** A thrown error: only its type, since its message is not ours to vouch for. */
function reportThrown(where: string, error: unknown): void {
  console.error(`[chat-log] ${where} threw`, { name: (error as Error)?.name });
}

/**
 * Log one answered turn (question + reply). Resolves to the reply's message id
 * when the rows were saved, null when they were not, so the client is only ever
 * handed an id that exists. Never throws.
 */
export async function logTurn(db: Db, input: TurnInput): Promise<string | null> {
  try {
    const { rows, assistantId } = buildTurnRows(input);
    const { error } = await db.from('chat_messages').insert(rows);
    if (error) {
      report('chat_messages insert', error);
      return null;
    }
    return assistantId;
  } catch (e) {
    reportThrown('chat_messages insert', e);
    return null;
  }
}

/** Record a question nothing can answer (or an answer marked bad). Never throws. */
export async function logGap(
  db: Db,
  gap: { userId: string; messageId: string; question: string; kind: GapKind },
): Promise<boolean> {
  try {
    const { error } = await db.from('help_gaps').upsert(
      {
        user_id: gap.userId,
        message_id: gap.messageId,
        question_text: capText(gap.question, MAX_QUESTION),
        kind: gap.kind,
      },
      { onConflict: 'message_id,kind', ignoreDuplicates: true },
    );
    if (error) {
      report('help_gaps insert', error);
      return false;
    }
    return true;
  } catch (e) {
    reportThrown('help_gaps insert', e);
    return false;
  }
}
