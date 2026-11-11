// ═══ AI Smart · the tool turn ═══
//
// The one loop every AI turn runs: ask the model, run the tools it calls, feed
// the results back, and stop. /api/ask uses it, and so does the eval runner, so a
// graded case exercises the same code the user does.
//
// Two walls, both here: the shared turn budget (budget.ts) and a hard loop limit,
// so a model that keeps calling tools stops with a plain reply instead of
// throwing, looping forever or spending another call.
import type Anthropic from '@anthropic-ai/sdk';
import type { ToolDb } from './contract';
import { parseCall, TOOLS } from './registry';
import { TOOL_SYSTEM } from './prompt';
import { TURN_BUDGET_REPLY, TURN_MODEL_CALL_CAP, type TurnBudget } from './budget';

export type ModelCall = (request: {
  system: string;
  tools: Anthropic.Tool[];
  messages: Anthropic.MessageParam[];
}) => Promise<Anthropic.Message>;

export type ToolRun = {
  name: string;
  args: unknown;
  status: 'ok' | 'error' | 'invalid' | 'unknown';
  output?: unknown;
};

export type TurnResult = {
  /** What the model said last, or the reserve reply for an exhausted turn. */
  replyText: string;
  /** Model calls this turn actually spent. */
  calls: number;
  budgetExhausted: boolean;
  toolRuns: ToolRun[];
  /** The outputs of every successful tool run: the only figures a reply may state. */
  toolResults: unknown[];
};

function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
}

/** The assistant turn as the API accepts it back, without any block we don't use. */
function assistantTurn(content: Anthropic.ContentBlock[]): Anthropic.ContentBlockParam[] {
  return content.flatMap((block): Anthropic.ContentBlockParam[] => {
    if (block.type === 'text') return [{ type: 'text', text: block.text }];
    if (block.type === 'tool_use') {
      return [{ type: 'tool_use', id: block.id, name: block.name, input: block.input }];
    }
    return [];
  });
}

export async function runToolTurn(input: {
  call: ModelCall;
  db: ToolDb;
  userId: string;
  question: string;
  budget: TurnBudget;
  system?: string;
  tools?: Anthropic.Tool[];
}): Promise<TurnResult> {
  const { call, db, userId, budget } = input;
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: input.question }];
  const toolRuns: ToolRun[] = [];
  let replyText = '';
  let calls = 0;
  let budgetExhausted = false;

  while (true) {
    // Hard wall first: even a reserver that never says no cannot loop forever.
    if (calls >= TURN_MODEL_CALL_CAP) {
      budgetExhausted = true;
      break;
    }
    if (!(await budget.spend())) {
      budgetExhausted = true;
      break;
    }
    calls += 1;

    const message = await call({
      system: input.system ?? TOOL_SYSTEM,
      tools: input.tools ?? TOOLS,
      messages,
    });

    const uses = message.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );
    if (message.stop_reason !== 'tool_use' || uses.length === 0) {
      replyText = textOf(message);
      break;
    }

    messages.push({ role: 'assistant', content: assistantTurn(message.content) });

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const use of uses) {
      const parsed = parseCall(use.name, use.input);
      if (!parsed.ok) {
        toolRuns.push({
          name: use.name,
          args: use.input,
          status: parsed.reason === 'unknown_tool' ? 'unknown' : 'invalid',
        });
        results.push({
          type: 'tool_result',
          tool_use_id: use.id,
          is_error: true,
          content: parsed.reason,
        });
        continue;
      }

      try {
        const raw = await parsed.tool.handler({ db, userId }, parsed.args as never);
        // The declared output schema is the only shape allowed out of a tool.
        const output = parsed.tool.output.parse(raw);
        toolRuns.push({ name: parsed.tool.name, args: parsed.args, status: 'ok', output });
        results.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: JSON.stringify(
            parsed.tool.modelPayload ? parsed.tool.modelPayload(output as never) : output,
          ),
        });
      } catch (error) {
        console.error('[tools] handler failed', parsed.tool.name, (error as Error)?.message);
        toolRuns.push({ name: parsed.tool.name, args: parsed.args, status: 'error' });
        results.push({
          type: 'tool_result',
          tool_use_id: use.id,
          is_error: true,
          content: 'lookup_failed',
        });
      }
    }
    messages.push({ role: 'user', content: results });
  }

  if (budgetExhausted) replyText = TURN_BUDGET_REPLY;

  return {
    replyText,
    calls,
    budgetExhausted,
    toolRuns,
    toolResults: toolRuns.flatMap((run) => (run.status === 'ok' ? [run.output] : [])),
  };
}
