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
// A card turn is paired with the pending action it was drawn from, so the model
// is told whether that action was later confirmed or is still only an offer. The
// pairing uses what tool_pending_actions already holds — no session id and no
// cancel flag: the action created in the same few seconds as the turn, under the
// same user, is that turn's action.
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

/**
 * How close in time a pending action must be to a card turn to be that turn's
 * action. The turn logs its card right after prepare() inserted the row, so the
 * gap is milliseconds; this is the tolerance, not a conversation window.
 */
export const PENDING_PAIR_MS = 10 * 1000;

/** How many of the owner's newest pending actions the reader asks for. */
export const PENDING_READ_LIMIT = 20;

/** One tool_pending_actions row, as the table holds it. */
export type PendingRow = {
  tool: string;
  created_at: string;
  expires_at: string;
  /** Set when a confirm claimed it; null while it is still confirmable. */
  executed_at: string | null;
};

export type PendingReader = () => Promise<readonly PendingRow[] | null | undefined>;

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

/**
 * The caller's own pending actions. RLS is the boundary; the explicit user_id
 * filter is the second lock, and it is also what makes a pairing "same user" by
 * construction.
 */
export function supabasePendingReader(client: SupabaseClient, userId: string): PendingReader {
  return async () => {
    const { data, error } = await client
      .from('tool_pending_actions')
      .select('tool, created_at, expires_at, executed_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(PENDING_READ_LIMIT);
    if (error) throw new Error(error.message);
    return (data ?? []) as PendingRow[];
  };
}

/** A failed read is no pending action, never a failed answer. */
export async function loadPendingRows(read: PendingReader): Promise<PendingRow[]> {
  try {
    return [...((await read()) ?? [])];
  } catch (e) {
    console.error('[ask] pending actions not loaded', (e as Error)?.message);
    return [];
  }
}

/**
 * A row the owner can still confirm: not executed, not expired, and made inside
 * the same conversation window as the history the model is shown.
 */
export function isLivePendingAction(row: PendingRow, now: Date = new Date()): boolean {
  if (row.executed_at) return false;
  const created = Date.parse(row.created_at);
  const expires = Date.parse(row.expires_at);
  if (!Number.isFinite(created) || !Number.isFinite(expires)) return false;
  return created >= now.getTime() - HISTORY_MAX_AGE_MS && expires > now.getTime();
}

/** True when there is a card the owner can still tap Confirm on. */
export function hasLivePendingAction(
  rows: readonly PendingRow[],
  now: Date = new Date(),
): boolean {
  return rows.some((row) => isLivePendingAction(row, now));
}

/**
 * The pending action a card turn was drawn from: the one created nearest before
 * the turn was logged, within PENDING_PAIR_MS. Null when there is no such row —
 * the turn then reads as a plain offer.
 */
export function pendingForTurn(
  turn: HistoryRow,
  pending: readonly PendingRow[],
): PendingRow | null {
  const at = Date.parse(turn.created_at);
  if (!Number.isFinite(at)) return null;
  let best: PendingRow | null = null;
  let bestAt = Number.NEGATIVE_INFINITY;
  for (const row of pending) {
    const created = Date.parse(row.created_at);
    if (!Number.isFinite(created)) continue;
    if (created > at || at - created > PENDING_PAIR_MS) continue;
    if (created > bestAt) {
      best = row;
      bestAt = created;
    }
  }
  return best;
}

/**
 * The sentence a confirmed card was drawn from: confirmSentence() composes
 * "Ready to confirm: <summary>." from the same row, so the summary is recovered
 * from the logged text rather than re-derived from the stored ids.
 */
export function confirmedSummary(said: string, pair: PendingRow): string {
  const text = said.trim();
  const match = /^Ready to confirm:\s*(.+?)\.?$/.exec(text);
  return match?.[1]?.trim() || text || pair.tool;
}

export function historyMessages(
  rows: readonly HistoryRow[],
  now: Date = new Date(),
  pending: readonly PendingRow[] = [],
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
    // When the turn's own pending action was executed, say that instead: the
    // change is saved and a second confirmation would be a second write.
    if (row.template_id === CONFIRM_CARD) {
      const pair = pendingForTurn(row, pending);
      messages.push({
        role: 'assistant',
        content: pair?.executed_at
          ? `(confirmed: ${confirmedSummary(said ?? '', pair)})`
          : `(offered a card: ${said || 'a change'}; nothing was saved)`,
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
