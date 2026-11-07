// POST /api/ask — AI Smart, Slice 0.
//
// One question in, one short answer out, from ONE read-only tool. This route
// sits BESIDE /api/parse and shares nothing with it but the rate-limit bucket:
// parse still owns the build-a-document conversation, and nothing here finalizes,
// renders a PDF or moves a status. The one write is the chat log (question,
// reply, tool name and row count; never the rows) through the caller's session,
// and a logging failure never changes the answer.
//
// Every read runs under the caller's own session, so RLS is the boundary: there
// is no service-role client in this file, and the single tool is a select.
//
// Money rule, same as parse: the model never states a figure. The server
// composes the money line from the tool result, and any sentence the model
// writes that carries a "$" amount is dropped before it is shown.
//
// Flag: needs BOTH the build-time NEXT_PUBLIC_AI_TOOLS flag and a Vercel preview
// environment, so production and local development answer 404.
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { MODEL } from '@/lib/ai';
import { AI_TOOLS, aiToolsForEnv } from '@/lib/feature-flags';
import {
  MAX_MODEL_CALLS,
  TOOL_SYSTEM,
  TOOLS,
  UNPAID_TOOL_NAME,
  parseToolArgs,
} from '@/lib/tools/registry';
import { readUnpaidInvoices, type UnpaidSummary } from '@/lib/tools/unpaid';
import { FALLBACK, replyFor } from '@/lib/tools/reply';
import { conversationIdFor } from '@/lib/chat-log/rows';
import { logTurn } from '@/lib/chat-log/write';

const NO_STORE = { headers: { 'Cache-Control': 'no-store' } };
const Body = z.object({
  question: z.string().trim().min(1).max(500),
  // Optional: groups the turns of one conversation in the chat log. A missing or
  // malformed value just starts a new one.
  conversationId: z.string().optional(),
});

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

/**
 * What the model sees of a result. Text amounts are included (it must not repeat
 * them) and the raw per-row numbers are not, so there is nothing tempting to
 * quote; totals stay numeric so it can reason about magnitude.
 */
function toolPayload(summary: UnpaidSummary) {
  return {
    total_count: summary.totalCount,
    total_balance: summary.totalBalance,
    total_balance_text: summary.totalBalanceText,
    invoices: summary.rows.map((row) => ({
      number: row.number,
      client: row.client,
      balance_text: row.balanceText,
      due_date: row.dueDate,
      status: row.status,
    })),
    note: 'Amounts are for your reasoning only. Never repeat a figure; the app prints money.',
  };
}

/** One structured line per model call. Never the question: it carries PII. */
function logUsage(call: number, usage: Anthropic.Usage, ms: number): void {
  console.log('[ask] model call', {
    call,
    model: MODEL,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    ms,
  });
}

export async function POST(req: NextRequest) {
  // Two gates: the build-time flag and a preview-only deployment.
  if (!AI_TOOLS || !aiToolsForEnv(process.env.VERCEL_ENV)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // No guest path: a read tool answers from the owner's own rows or not at all.
  if (!user) {
    return NextResponse.json(
      { reply: "Sign in and I'll look that up for you." },
      { status: 401, ...NO_STORE }
    );
  }

  // Same bucket as the parse route: one conversation-shaped AI route, one ceiling.
  if (!(await rateLimit('parse', rateIdentifier(req, user.id)))) {
    return NextResponse.json({ reply: 'One sec — slow down a moment.' }, { status: 429, ...NO_STORE });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ reply: 'Say that again?' }, { status: 400, ...NO_STORE });
  }
  const question = parsed.data.question;
  const askedAt = new Date();
  const conversationId = conversationIdFor(parsed.data.conversationId);
  let tokensIn = 0;
  let tokensOut = 0;

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: question }];
  let summary: UnpaidSummary | null = null;
  let toolCalled = false;
  let replyText = '';

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    for (let call = 1; call <= MAX_MODEL_CALLS; call++) {
      const startedAt = Date.now();
      const message = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 512,
        system: TOOL_SYSTEM,
        tools: TOOLS,
        messages,
      });
      logUsage(call, message.usage, Date.now() - startedAt);
      tokensIn += message.usage.input_tokens;
      tokensOut += message.usage.output_tokens;

      const uses = message.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );
      if (message.stop_reason !== 'tool_use' || uses.length === 0) {
        replyText = textOf(message);
        break;
      }

      messages.push({ role: 'assistant', content: assistantTurn(message.content) });

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const use of uses) {
        const callArgs = parseToolArgs(use.name, use.input);
        if (!callArgs.ok) {
          results.push({
            type: 'tool_result',
            tool_use_id: use.id,
            is_error: true,
            content: callArgs.reason,
          });
          continue;
        }
        if (use.name === UNPAID_TOOL_NAME) {
          toolCalled = true;
          const found = await readUnpaidInvoices(supabase, user.id, {
            minBalance: callArgs.args.min_balance,
            cap: callArgs.args.limit,
          });
          if (!found.ok) {
            results.push({
              type: 'tool_result',
              tool_use_id: use.id,
              is_error: true,
              content: 'lookup_failed',
            });
            continue;
          }
          summary = found;
          results.push({
            type: 'tool_result',
            tool_use_id: use.id,
            content: JSON.stringify(toolPayload(found)),
          });
        }
      }
      messages.push({ role: 'user', content: results });
    }
  } catch (e) {
    console.error('[ask] failed', (e as Error)?.message);
    return NextResponse.json({ reply: FALLBACK }, { status: 500, ...NO_STORE });
  }

  const reply = replyFor({ modelText: replyText, summary, toolCalled });

  // Log the turn. A logging failure is caught inside logTurn and never changes
  // the answer; the id is only returned when the rows were actually saved. The
  // tool is logged by name and row count, never by its rows.
  const answeredAt = new Date();
  const messageId = await logTurn(supabase, {
    userId: user.id,
    conversationId,
    question,
    reply,
    route: 'ask',
    toolName: toolCalled ? UNPAID_TOOL_NAME : null,
    toolRowCount: summary ? summary.rows.length : null,
    model: MODEL,
    latencyMs: answeredAt.getTime() - askedAt.getTime(),
    tokensIn,
    tokensOut,
    askedAt,
    answeredAt,
  });

  return NextResponse.json(
    {
      reply,
      // Additive: the assistant message's id (for feedback) and its conversation.
      // messageId is null when the log write failed.
      messageId,
      conversationId,
      tool: summary
        ? {
          totalCount: summary.totalCount,
          totalBalance: summary.totalBalance,
          totalBalanceText: summary.totalBalanceText,
          rows: summary.rows,
        }
        : null,
    },
    NO_STORE
  );
}
