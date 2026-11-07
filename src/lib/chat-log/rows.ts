// ═══ AI chat log · pure row building and feedback rules ═══
//
// What /api/ask and /api/route write to chat_messages, and what /api/ask/feedback
// accepts. No I/O here, so every rule is unit-tested.
//
// Privacy rule, enforced by the shape of the row: a tool is logged by NAME and
// by how many rows it returned, never by the rows. ChatMessageRow has no field
// that could hold them.
import { z } from 'zod';

/** What the router may say a message is (mirrors lib/router/decide). */
export type ChatRoute = 'ask' | 'build' | 'unsupported';

/** The column caps in 20261106100000_ai_chat_logging.sql. */
export const MAX_TEXT = 4000;
export const MAX_REASON = 500;
export const MAX_QUESTION = 1000;

export interface ChatMessageRow {
  id: string;
  user_id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  text: string;
  route: ChatRoute | null;
  tool_name: string | null;
  tool_row_count: number | null;
  model: string | null;
  latency_ms: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
  created_at: string;
}

export interface TurnInput {
  userId: string;
  conversationId: string;
  question: string;
  reply: string;
  route: ChatRoute;
  /** The tool that ran, or null. */
  toolName: string | null;
  /** How many rows the tool returned. Ignored when no tool ran. */
  toolRowCount: number | null;
  model: string | null;
  latencyMs: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  /** When the question arrived; the reply is stamped `answeredAt`. */
  askedAt: Date;
  answeredAt: Date;
}

/** A non-negative whole number, or null for anything else. */
export function wholeOrNull(n: number | null | undefined): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

export function capText(text: string, max: number = MAX_TEXT): string {
  return text.length <= max ? text : text.slice(0, max);
}

/**
 * The two rows of one answered turn: the question, then the reply.
 *
 * created_at is set here, not by the database: both rows go in one statement,
 * where now() would be identical, and the feedback route finds a reply's
 * question by ordering on it. The reply is always stamped after the question.
 */
export function buildTurnRows(
  input: TurnInput,
  newId: () => string = () => crypto.randomUUID(),
): { rows: ChatMessageRow[]; assistantId: string } {
  const asked = input.askedAt.getTime();
  const answered = Math.max(input.answeredAt.getTime(), asked + 1);
  const hasTool = input.toolName !== null && input.toolName !== '';
  const assistantId = newId();

  const user: ChatMessageRow = {
    id: newId(),
    user_id: input.userId,
    conversation_id: input.conversationId,
    role: 'user',
    text: capText(input.question),
    route: input.route,
    tool_name: null,
    tool_row_count: null,
    model: null,
    latency_ms: null,
    tokens_in: null,
    tokens_out: null,
    created_at: new Date(asked).toISOString(),
  };
  const assistant: ChatMessageRow = {
    id: assistantId,
    user_id: input.userId,
    conversation_id: input.conversationId,
    role: 'assistant',
    text: capText(input.reply),
    route: input.route,
    tool_name: hasTool ? (input.toolName as string).slice(0, 80) : null,
    tool_row_count: hasTool ? wholeOrNull(input.toolRowCount) : null,
    model: input.model ? input.model.slice(0, 100) : null,
    latency_ms: wholeOrNull(input.latencyMs),
    tokens_in: wholeOrNull(input.tokensIn),
    tokens_out: wholeOrNull(input.tokensOut),
    created_at: new Date(answered).toISOString(),
  };
  return { rows: [user, assistant], assistantId };
}

/** The conversation a turn belongs to: the client's if it sent a valid one. */
export function conversationIdFor(
  supplied: string | null | undefined,
  newId: () => string = () => crypto.randomUUID(),
): string {
  return typeof supplied === 'string' && z.string().uuid().safeParse(supplied).success
    ? supplied
    : newId();
}

// ── Feedback ──────────────────────────────────────────────────────────────

export const FeedbackBody = z.object({
  messageId: z.string().uuid(),
  rating: z.union([z.literal(-1), z.literal(1)]),
  reason: z.string().max(2000).nullish(),
});

/** A reason is optional free text; blank means none, and it is capped. */
export function normalizeReason(reason: string | null | undefined): string | null {
  const t = (reason ?? '').trim();
  return t ? t.slice(0, MAX_REASON) : null;
}

export type GapKind = 'unsupported' | 'thumbs_down';

/**
 * Whether a vote on a message is a help gap. A thumbs-down on an answer is one.
 * A thumbs-down on an 'unsupported' reply is not a second one: that question was
 * already recorded as a gap when the router declined it.
 */
export function gapKindForVote(input: {
  rating: -1 | 1;
  messageRoute: ChatRoute | null;
}): GapKind | null {
  if (input.rating !== -1) return null;
  return input.messageRoute === 'unsupported' ? null : 'thumbs_down';
}
