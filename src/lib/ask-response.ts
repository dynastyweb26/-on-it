// The JSON shape POST /api/ask returns. The destination is a sibling of the
// template, never a property inside it: the client owns the card data and the
// route owns where the card's "Show all" should go.
import type { ToolCard } from '@/lib/tools/registry';

export type AskDestination = { screen: string; path: string };

export type AskResponseInput = {
  reply: string;
  messageId: string | null;
  template: ToolCard | null;
  destination: AskDestination | null;
  fallback: string | null;
  tool: unknown;
  pending: unknown;
};

/**
 * The typed answer when the daily AI limit is spent. Same shape as a turn, plus
 * the numbers the meter needs and `kind: 'limit'` for the client to key on.
 * `reply` is empty on purpose: the wording is the UI's (see the Handoff Note),
 * and no chat_messages row was written, so messageId is null.
 */
export type AskLimitBody = AskResponseInput & {
  kind: 'limit';
  used: number;
  limit: number;
  resetsAt: string;
  reply: '';
};

export function askLimitBody(input: { used: number; limit: number; resetsAt: string }): AskLimitBody {
  return {
    kind: 'limit',
    used: input.used,
    limit: input.limit,
    resetsAt: input.resetsAt,
    reply: '',
    messageId: null,
    template: null,
    destination: null,
    fallback: null,
    tool: null,
    pending: null,
  };
}

export function askResponseBody(input: AskResponseInput): AskResponseInput {
  return {
    reply: input.reply,
    messageId: input.messageId,
    template: input.template,
    destination: input.destination,
    fallback: input.fallback,
    tool: input.tool,
    pending: input.pending,
  };
}
