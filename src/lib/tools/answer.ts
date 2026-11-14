// ═══ AI Smart · the answer /api/ask sends ═══
//
// One pure composition, so "which sentence leads" is testable without HTTP.
// Every tool is treated the same way: if it ran ok, ITS own server-composed
// sentence leads and the model's money-free prose follows. Only a turn where no
// tool ran says "I can't look that up yet." — and that turn carries the cant.do
// card, because that is a question nothing here can answer.
import type { Registry, ToolDefinition } from './contract';
import { cardFor, type ToolCard } from './registry';
import { TURN_BUDGET_REPLY } from './budget';
import { UNPAID_TOOL_NAME } from './definitions/unpaid';
import { cantDoCard, replyFor } from './reply';
import type { ToolRun } from './turn';

/** The part of a tool run this module needs; the turn fills the rest. */
export type AnswerRun = Pick<ToolRun, 'name' | 'status'> & { output?: unknown };

export type AskAnswer = {
  /** The text under the card. */
  reply: string;
  /** The ok tool's own sentence, or null when no tool produced one. */
  sentence: string | null;
  /** The ok tool's card, the cant.do card, or null. */
  card: ToolCard | null;
  /** The ok tool, for its destination and its result payload. */
  tool: ToolDefinition | null;
};

export function answerFor(input: {
  modelText: string;
  toolRuns: readonly AnswerRun[];
  registry: Registry;
  /** The turn spent its model-call budget before the model could answer. */
  budgetExhausted?: boolean;
}): AskAnswer {
  const okRun = input.toolRuns.find((run) => run.status === 'ok');
  const tool = okRun ? input.registry.find(okRun.name) ?? null : null;
  const sentence = okRun && tool ? tool.fallback(okRun.output as never) : null;
  const card: ToolCard | null = okRun && tool
    ? cardFor(tool, okRun.output)
    : input.toolRuns.length === 0
      ? cantDoCard()
      : null;

  if (input.budgetExhausted) {
    // Out of calls, but a sentence was already composed: say that, not the
    // reserve line.
    return { reply: sentence ?? TURN_BUDGET_REPLY, sentence, card, tool };
  }

  return {
    reply: replyFor({
      modelText: input.modelText,
      sentence,
      toolCalled: input.toolRuns.length > 0,
      // The unpaid tool's empty result is a complete answer on its own.
      sentenceIsWholeAnswer:
        okRun?.name === UNPAID_TOOL_NAME
        && (okRun.output as { totalCount?: number } | undefined)?.totalCount === 0,
    }),
    sentence,
    card,
    tool,
  };
}
