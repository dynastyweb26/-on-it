// POST /api/ask — AI Smart.
//
// One question in, one short answer out, from the READ-ONLY tool registry. This
// route sits BESIDE /api/parse and shares nothing with it but the rate-limit
// bucket and the turn budget: parse still owns the build-a-document
// conversation, and nothing here writes, finalizes, renders a PDF or moves a
// status.
//
// Every read runs under the caller's own session, so RLS is the boundary: there
// is no service-role client in this file, and no tool can reach one.
//
// Money rule: the model never states a figure. The server composes the money
// line from the tool result, and model prose may only carry a figure the tool
// result already contains.
//
// Budget: one turn (router + this route) may spend 8 model calls together; the
// client shares its turn id through x-turn-id. A spent turn answers in plain
// words instead of throwing.
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
import { TURN_BUDGET_REPLY, createTurnBudget } from '@/lib/tools/budget';
import { UNPAID_TOOL_NAME } from '@/lib/tools/definitions/unpaid';
import { supabaseToolDb } from '@/lib/tools/db';
import { FALLBACK, replyFor } from '@/lib/tools/reply';
import { guardModelMoney } from '@/lib/tools/money';
import { createPendingAction } from '@/lib/tools/confirm';
import { supabasePendingStore } from '@/lib/tools/pending-store';
import { runToolTurn, type TurnResult } from '@/lib/tools/turn';
import type { UnpaidSummary } from '@/lib/tools/unpaid';

const NO_STORE = { headers: { 'Cache-Control': 'no-store' } };
const Body = z.object({ question: z.string().trim().min(1).max(500) });

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

  // The shared budget for this user turn; without the header it is per request.
  const budget = createTurnBudget({ userId: user.id, turnId: req.headers.get('x-turn-id') });
  const db = supabaseToolDb(supabase);

  let result: TurnResult;
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    let callIndex = 0;
    result = await runToolTurn({
      call: async ({ system, tools, messages }) => {
        const startedAt = Date.now();
        const message = await anthropic.messages.create({
          model: MODEL,
          max_tokens: 512,
          system,
          tools,
          messages,
        });
        callIndex += 1;
        logUsage(callIndex, message.usage, Date.now() - startedAt);
        return message;
      },
      db,
      userId: user.id,
      question,
      budget,
      // A write tool proposed here stays pending until /api/ai/confirm runs it.
      pending: async ({ tool, args }) => {
        const created = await createPendingAction({
          userId: user.id,
          tool,
          args,
          store: supabasePendingStore(supabase, user.id),
        });
        return { actionId: created.id, token: created.token, expiresAt: created.expiresAt, tool };
      },
    });
  } catch (e) {
    console.error('[ask] failed', (e as Error)?.message);
    return NextResponse.json({ reply: FALLBACK }, { status: 500, ...NO_STORE });
  }

  const summary = (result.toolRuns.find(
    (run) => run.status === 'ok' && run.name === UNPAID_TOOL_NAME,
  )?.output ?? null) as UnpaidSummary | null;

  // Money guard: a dollar figure the model states must already exist in this
  // turn's tool results. A sentence carrying one that does not is dropped.
  const moneyGuard = guardModelMoney(result.replyText, result.toolResults);
  if (!moneyGuard.ok) {
    console.error('[ask] dropped model money with no tool source', moneyGuard.offending);
  }

  // A turn that ran out of model calls says so in plain words: the server
  // sentence when one was composed, otherwise the reserve reply. Never an error.
  const reply = result.budgetExhausted
    ? summary?.sentence ?? TURN_BUDGET_REPLY
    : replyFor({ modelText: moneyGuard.text, summary, toolCalled: !!summary });

  return NextResponse.json(
    {
      reply,
      tool: summary
        ? {
          totalCount: summary.totalCount,
          totalBalance: summary.totalBalance,
          totalBalanceText: summary.totalBalanceText,
          rows: summary.rows,
        }
        : null,
      pending: result.pending,
    },
    NO_STORE
  );
}
