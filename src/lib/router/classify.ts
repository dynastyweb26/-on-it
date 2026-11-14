// ═══ Chat router · Slice 2 — one small model call ═══
//
// Haiku-class, forced tool call, enum-only output. The model cannot write prose
// and has no way to state an amount: the only thing it can return is one of
// three words, validated below. Anything else — a timeout, an SDK error, a
// refusal, a malformed block — is null, and null means "use the old path".
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { MODEL } from '@/lib/ai';
import { sanitizeForAI } from '@/lib/sanitize';
import type { RouterRoute } from './decide';

/** The one place the router's model is named (Haiku-class, same as parse). */
export const ROUTER_MODEL = MODEL;
/** Hard ceiling for the whole call, abort included. */
export const ROUTER_TIMEOUT_MS = 2000;
export const ROUTER_TOOL_NAME = 'route_message';

/** The only shape a valid answer can take. Unknown extras are ignored, not fatal. */
export const RouterOutput = z.object({ route: z.enum(['ask', 'build', 'unsupported']) });

export const ROUTER_TOOLS: Anthropic.Tool[] = [
  {
    name: ROUTER_TOOL_NAME,
    description: 'Record the single route for the message. Call this exactly once.',
    input_schema: {
      type: 'object',
      properties: {
        route: { type: 'string', enum: ['ask', 'build', 'unsupported'] },
      },
      required: ['route'],
      additionalProperties: false,
    },
  },
];

/**
 * The rules, in the model's own words. The asymmetry is deliberate and is the
 * safety property of the whole slice: a build mistaken for a question is a
 * broken invoice flow, while a question mistaken for a build just gets the old
 * "what was the amount?" answer. So every tie breaks toward build.
 */
export const ROUTER_SYSTEM = `You sort ONE message from a contractor's invoicing app into one route. You never answer the message and never write a reply. Call ${ROUTER_TOOL_NAME} with exactly one route.

ask — the user wants something LOOKED UP: a question or a command about their own invoices, estimates, payments, expenses, clients, saved prices or money totals. A lookup with no question mark is still ask: show, find, pull up, list, open, look up, what about, who, how much, when. Examples: "who hasn't paid me", "how much do people owe me", "find Ruth", "show me my invoices", "pull up the Smith estimate", "when did Smith pay".

build — the user wants to create, record, send or edit an invoice, estimate, expense or payment, OR the message is an answer, correction or follow-up inside a job already in progress. Examples: "invoice ZZ Test A $50 for a repair", "Maria hasn't paid, bill her again", "$40", "make it 50", "add a line for the filter".

unsupported — a question about the user's own numbers that NO lookup can answer yet: what they spent, expenses, profit, taxes, income, bank balance, what they owe someone else. Examples: "how much did I spend on gas?", "what's my profit this month?", "how much do I owe in taxes?".

When you are unsure between ask and build, answer build. A wrong build is an invoice the user can fix; a missed question just gets the old answer. When a message carries a figure or a job detail and no clear account question, it is build. A bare figure is build.`;

/** One model call, injected so tests can fake a timeout, garbage or an error. */
export type RouteCall = (args: { message: string; signal: AbortSignal }) => Promise<unknown>;

/**
 * Classify one message, bounded by `timeoutMs`. Returns null on every failure so
 * the caller can fall back; it never throws.
 */
export async function classify(
  message: string,
  call: RouteCall,
  timeoutMs: number = ROUTER_TIMEOUT_MS,
): Promise<RouterRoute | null> {
  const text = sanitizeForAI(message.trim());
  if (!text) return null;

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Race a null against the call: if the call ignores the abort, the turn still
  // ends here on time.
  const expired = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, timeoutMs);
  });

  try {
    const raw = await Promise.race([call({ message: text, signal: controller.signal }), expired]);
    const parsed = RouterOutput.safeParse(raw);
    return parsed.success ? parsed.data.route : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The real call. Forced tool_choice means the model cannot reply in prose, and
 * the tool is the only output channel. Usage is logged in the same shape as
 * /api/ask — counts and timing only, never the message (it carries PII).
 */
export function anthropicRouteCall(apiKey = process.env.ANTHROPIC_API_KEY): RouteCall {
  const client = new Anthropic({
    apiKey,
    timeout: ROUTER_TIMEOUT_MS,
    maxRetries: 0,
  });

  return async ({ message, signal }) => {
    const startedAt = Date.now();
    const res = await client.messages.create(
      {
        model: ROUTER_MODEL,
        // Room for the forced tool block and its JSON; a truncated block would be
        // read as garbage, which is safe but wasteful.
        max_tokens: 64,
        system: ROUTER_SYSTEM,
        tools: ROUTER_TOOLS,
        tool_choice: { type: 'tool', name: ROUTER_TOOL_NAME },
        messages: [{ role: 'user', content: `<user_input>${message}</user_input>` }],
      },
      { signal },
    );

    console.log('[route] model call', {
      model: ROUTER_MODEL,
      input_tokens: res.usage.input_tokens,
      output_tokens: res.usage.output_tokens,
      ms: Date.now() - startedAt,
    });

    const use = res.content.find(
      (block): block is Anthropic.ToolUseBlock =>
        block.type === 'tool_use' && block.name === ROUTER_TOOL_NAME,
    );
    return use ? use.input : null;
  };
}
