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

/** Each side of an exchange is cut to this, so one long turn cannot crowd out the rest. */
export const HISTORY_TEXT_MAX = 500;

/** Older than this and the turn is not this conversation any more. */
export const HISTORY_MAX_AGE_MS = 30 * 60 * 1000;

/** One logged turn, as chat_messages holds it. */
export type HistoryRow = {
  user_text: string;
  reply_text: string | null;
  /** The card this turn offered, when it offered one. Null is plain text. */
  template_id?: string | null;
  created_at: string;
};

/** The one card the app can confirm: a write or send proposal. */
export const CONFIRM_CARD = 'confirm.batch';

/** What this module asks the database for: one session, newest first, capped. */
export type HistoryQuery = { sessionId: string; limit: number };

export type HistoryReader = (query: HistoryQuery) => Promise<readonly HistoryRow[] | null | undefined>;

/**
 * The caller's own session client. RLS is the boundary; the explicit user_id
 * filter is the second lock, so a missing policy still cannot return a row that
 * belongs to someone else who happens to share this session id.
 */
export function supabaseHistoryReader(client: SupabaseClient, userId: string): HistoryReader {
  return async ({ sessionId, limit }) => {
    const { data, error } = await client
      .from('chat_messages')
      .select('user_text, reply_text, template_id, created_at')
      .eq('user_id', userId)
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
/** The rows that are this conversation: fresh, ordered old to new, capped. */
function recentRows(rows: readonly HistoryRow[], now: Date): HistoryRow[] {
  const cutoff = now.getTime() - HISTORY_MAX_AGE_MS;
  return rows
    .filter((row) => {
      const at = Date.parse(row.created_at);
      return Number.isFinite(at) && at >= cutoff;
    })
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    .slice(-HISTORY_TURNS);
}

/**
 * True when the newest turn the model would see offered a confirm card. Only a
 * card the app can confirm counts: a lookup card has no Confirm to tap.
 */
export function lastTurnOfferedCard(
  rows: readonly HistoryRow[],
  now: Date = new Date(),
): boolean {
  const latest = recentRows(rows, now).at(-1);
  return latest?.template_id === CONFIRM_CARD;
}

export function historyMessages(
  rows: readonly HistoryRow[],
  now: Date = new Date(),
): Anthropic.MessageParam[] {
  const kept = recentRows(rows, now);

  const messages: Anthropic.MessageParam[] = [];
  for (const row of kept) {
    const asked = row.user_text.trim().slice(0, HISTORY_TEXT_MAX);
    if (!asked) continue;
    messages.push({ role: 'user', content: asked });
    const said = row.reply_text?.trim().slice(0, HISTORY_TEXT_MAX);
    // A turn that offered a confirm card is not a pending instruction: say what
    // it was and that nothing was saved, so the model cannot read it as "do it".
    if (row.template_id === CONFIRM_CARD) {
      messages.push({
        role: 'assistant',
        content: `(offered a card: ${said || 'a change'}; nothing was saved)`,
      });
    } else if (said) {
      messages.push({ role: 'assistant', content: said });
    }
  }
  return messages;
}

export async function loadHistoryRows(
  read: HistoryReader,
  sessionId: string | null | undefined,
): Promise<HistoryRow[]> {
  const session = sessionId?.trim();
  // "unknown" is the logger's placeholder, not a session: rows from every
  // session share it, so it is never read as one conversation.
  if (!session || session === 'unknown') return [];

  try {
    const rows = await read({ sessionId: session, limit: HISTORY_TURNS });
    return [...(rows ?? [])];
  } catch (e) {
    console.error('[ask] history not loaded', (e as Error)?.message);
    return [];
  }
}

/**
 * The earlier messages for this session, or none. A missing session (the client
 * did not name one), a signed-out caller and a read failure all answer [].
 */
export async function loadHistory(
  read: HistoryReader,
  sessionId: string | null | undefined,
  now: Date = new Date(),
): Promise<Anthropic.MessageParam[]> {
  return historyMessages(await loadHistoryRows(read, sessionId), now);
}
