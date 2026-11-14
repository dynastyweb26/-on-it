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
import { ConfirmBatchProps } from '@/lib/templates/props';
import type { PendingProposal, ToolRun } from './turn';

/**
 * The confirm.batch card for a turn's proposals: ONE row today, built from what
 * prepare() composed. Null when the props do not fit, and then the sentence
 * still stands alone.
 */
export function proposalCard(pending: readonly PendingProposal[]): ToolCard | null {
  if (pending.length === 0) return null;
  const props = ConfirmBatchProps.safeParse({
    state: 'pending',
    actions: pending.map((proposal) => ({
      id: proposal.actionId,
      kind: 'record',
      icon: proposal.row.icon,
      summary: proposal.row.summary,
      detail: proposal.row.detail,
      amount: proposal.row.amount,
      tone: proposal.row.tone,
      status: 'pending',
    })),
  });
  return props.success ? { id: 'confirm.batch', props: props.data } : null;
}

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
  /** Proposals this turn made, each with its server-composed card row. */
  pending?: readonly PendingProposal[];
}): AskAnswer {
  const okRun = input.toolRuns.find((run) => run.status === 'ok');
  if (okRun) {
    const tool = input.registry.find(okRun.name) ?? null;
    const sentence = tool ? tool.fallback(okRun.output as never) : null;
    const card: ToolCard | null = tool ? cardFor(tool, okRun.output) : null;
    if (input.budgetExhausted) {
      // Out of calls, but a sentence was already composed: say that, not the
      // reserve line.
      return { reply: sentence ?? TURN_BUDGET_REPLY, sentence, card, tool };
    }
    return {
      reply: replyFor({
        modelText: input.modelText,
        sentence,
        toolCalled: true,
        // The unpaid tool's empty result is a complete answer on its own.
        sentenceIsWholeAnswer:
          okRun.name === UNPAID_TOOL_NAME
          && (okRun.output as { totalCount?: number } | undefined)?.totalCount === 0,
      }),
      sentence,
      card,
      tool,
    };
  }

  // A prepared write that refused: its own sentence, and never a card.
  const problemRun = input.toolRuns.find((run) => run.status === 'problem');
  const problem = problemRun
    ? (problemRun.output as { problem?: string } | undefined)?.problem ?? null
    : null;
  if (problem) {
    // The refusal sentence is the answer. Model prose is not appended: it would
    // let the model talk over "I could not do that" with a guess.
    return {
      reply: problem,
      sentence: problem,
      card: null,
      tool: input.registry.find(problemRun?.name ?? '') ?? null,
    };
  }

  // A proposal waiting for the owner: one confirm.batch row and the sentence
  // that says it is READY, never that it was saved.
  const proposal = input.pending?.[0];
  if (proposal) {
    // Nothing was written, so nothing else may be said: the sentence says READY
    // and the card takes the confirm. Model prose could claim it is done.
    return {
      reply: proposal.sentence,
      sentence: proposal.sentence,
      card: proposalCard(input.pending ?? []),
      tool: input.registry.find(proposal.tool) ?? null,
    };
  }

  return {
    reply: input.budgetExhausted
      ? TURN_BUDGET_REPLY
      : replyFor({
        modelText: input.modelText,
        sentence: null,
        toolCalled: input.toolRuns.length > 0,
      }),
    sentence: null,
    card: input.toolRuns.length === 0 ? cantDoCard() : null,
    tool: null,
  };
}
