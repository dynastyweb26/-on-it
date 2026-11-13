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
