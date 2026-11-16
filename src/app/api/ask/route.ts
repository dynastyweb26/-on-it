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
// History: the caller's own last turns in THIS chat session ride along as earlier
// messages (lib/tools/history). Read under the caller's session, RLS only, and
// never tool payloads — text only.
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
import { AI_TOOLS, NEXT_PUBLIC_TIERS, aiToolsForEnv } from '@/lib/feature-flags';
import { aiLimitForUserId } from '@/lib/ai-limit-usage';
import { createTurnBudget } from '@/lib/tools/budget';
import { UNPAID_TOOL_NAME } from '@/lib/tools/definitions/unpaid';
import { supabaseToolDb } from '@/lib/tools/db';
import { FALLBACK } from '@/lib/tools/reply';
import { answerFor } from '@/lib/tools/answer';
import { guardModelMoney } from '@/lib/tools/money';
import { noToolLog } from '@/lib/tools/diagnose';
import { createPendingAction } from '@/lib/tools/confirm';
import { supabasePendingStore } from '@/lib/tools/pending-store';
import { aiEnvRefusal, logEnvRefusal } from '@/lib/tools/env-guard';
import { logTurn, sessionFrom, supabaseChatLog, turnIndexFrom } from '@/lib/tools/log';
import {
  hasLivePendingAction,
  historyMessages,
  lastTurnOfferedCard,
  loadHistoryRows,
  loadPendingRows,
  supabaseHistoryReader,
  supabasePendingReader,
} from '@/lib/tools/history';
import { isAffirmationOnly, TAP_CONFIRM_REPLY } from '@/lib/tools/affirm';
import { REGISTRY } from '@/lib/tools/registry';
import { askLimitBody, askResponseBody } from '@/lib/ask-response';
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

  // A preview pointed at the production database must never answer: the guard
  // names the misconfiguration in the server log instead of writing real rows.
  const refusal = aiEnvRefusal({
    flagOn: AI_TOOLS,
    vercelEnv: process.env.VERCEL_ENV,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  if (refusal) {
    logEnvRefusal(refusal, 'ask');
    return NextResponse.json(
      { error: refusal, reply: 'The assistant is not available on this preview.' },
      { status: 503, ...NO_STORE },
    );
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

  // Tiers: the daily AI limit, checked before the affirmation shortcut and
  // before any model call. Flag off → no profile read and no count query, so
  // this route is exactly today's. A count that fails returns null and the
  // question is answered (fail-open: a meter never blocks the assistant).
  if (NEXT_PUBLIC_TIERS) {
    const limit = await aiLimitForUserId(supabase, user.id);
    if (limit && !limit.allowed) {
      // No model call, no chat_messages row: only the typed answer.
      return NextResponse.json(
        askLimitBody({ used: limit.used, limit: limit.limit, resetsAt: limit.resetsAt }),
        NO_STORE,
      );
    }
  }

  // The shared budget for this user turn; without the header it is per request.
  const budget = createTurnBudget({ userId: user.id, turnId: req.headers.get('x-turn-id') });
  const db = supabaseToolDb(supabase);

  // Memory: the caller's own last turns in this session, oldest first. RLS plus
  // the reader's own user_id filter both hold; a failed read is an empty history.
  const historyRows = await loadHistoryRows(
    supabaseHistoryReader(supabase, user.id),
    sessionFrom(req.headers),
  );
  // The actions those cards were drawn from: one tells the model whether a card
  // turn was confirmed or is still an offer, and one live row is what makes a
  // bare "yes" mean "tap the card". No session id and no cancel flag is stored;
  // a row that was never executed and has not expired is the live one.
  const pendingRows = await loadPendingRows(supabasePendingReader(supabase, user.id));
  const now = new Date();
  const history = historyMessages(historyRows, now, pendingRows);

  // A bare "yes" right after a confirm card means tap the card. This used to be
  // a prompt rule, and the model started reading real requests after a card as
  // yeses ("change Ruth Lawrence phone to 555-0199" got no tool call). It is code
  // now: only a message that is nothing but an affirmation is answered here, and
  // only when the newest earlier turn offered a confirm card that is still live
  // (not confirmed, not expired) — otherwise there is no card to tap.
  if (
    isAffirmationOnly(question)
    && lastTurnOfferedCard(historyRows, now)
    && hasLivePendingAction(pendingRows, now)
  ) {
    const reply = TAP_CONFIRM_REPLY;
    const messageId = await logTurn(supabaseChatLog(supabase), {
      userId: user.id,
      sessionId: sessionFrom(req.headers),
      turn: turnIndexFrom(req.headers),
      userText: question,
      replyText: reply,
      toolsCalled: [],
      templateId: null,
      inputTokens: 0,
      outputTokens: 0,
    });
    return NextResponse.json(
      askResponseBody({
        reply,
        messageId,
        template: null,
        destination: null,
        fallback: null,
        tool: null,
        pending: null,
      }),
      NO_STORE,
    );
  }

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
      history,
      budget,
      // A write tool proposed here stays pending until /api/ai/confirm runs it.
      // What is stored is prepare()'s resolved ids, never the model's args: the
      // confirm can only write what the tool itself validated.
      pending: async ({ tool, resolved }) => {
        const created = await createPendingAction({
          userId: user.id,
          tool,
          resolved,
          store: supabasePendingStore(supabase, user.id),
        });
        return { actionId: created.id, token: created.token, expiresAt: created.expiresAt };
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

  // Blind spot: a turn that ran no tool used to leave nothing in the log, so the
  // "one call, no tool" reports could not be traced. A preview logs one line —
  // the stop reason and the model's own prose, cut short, and never the user's
  // message.
  if (process.env.VERCEL_ENV === 'preview') {
    const gap = noToolLog(result);
    if (gap) console.log('[ask] no tool run', gap);
  }

  // What the user reads, whichever tool ran: the card (or the cant.do card when
  // no tool ran), that tool's own server-composed sentence, and the plain text
  // shown when no component exists. A null card is never replaced by a makeshift
  // one, and a turn out of model calls still answers from the same sentence.
  const answer = answerFor({
    modelText: moneyGuard.text,
    toolRuns: result.toolRuns,
    registry: REGISTRY,
    question,
    budgetExhausted: result.budgetExhausted,
    pending: result.pending,
  });
  const { card, tool: okTool } = answer;
  const reply = answer.reply;
  const fallback = answer.sentence;

  // Chat logging: one row per turn, under the caller's session. Best effort —
  // a failed log never fails the answer the user is waiting for.
  const loggedRun = result.toolRuns.find((run) => run.status === 'ok');
  const messageId = await logTurn(supabaseChatLog(supabase), {
    userId: user.id,
    sessionId: sessionFrom(req.headers),
    turn: turnIndexFrom(req.headers),
    userText: question,
    replyText: reply,
    toolsCalled: result.toolRuns.map((run) => run.name),
    templateId: loggedRun
      ? REGISTRY.find(loggedRun.name)?.defaultTemplate.id ?? null
      // A proposal has no ok run; the card is the turn's own confirm.batch.
      : card?.id ?? null,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
  });

  return NextResponse.json(
    askResponseBody({
      reply,
      messageId,
      template: card,
      destination: okTool?.destination ?? null,
      fallback,
      tool: summary
        ? {
          totalCount: summary.totalCount,
          totalBalance: summary.totalBalance,
          totalBalanceText: summary.totalBalanceText,
          rows: summary.rows,
        }
        : null,
      pending: result.pending,
    }),
    NO_STORE
  );
}
