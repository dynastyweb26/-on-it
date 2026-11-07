// POST /api/route — Chat router, Slice 2.
//
// One message in, one route out. It sits BESIDE /api/ask and /api/parse and
// shares nothing with them but the rate-limit bucket: it reads nothing from the
// database and never answers the message with a tool. The only write is the chat
// log for a message it declines ('unsupported'), through the caller's session. Its only job is to
// say which of the two existing paths should handle it.
//
// A separate route rather than folding this into /api/ask on purpose: ask's
// contract is "question in, answer out" with a three-call tool loop, and a
// 'build' result is a signal, not a reply. Keeping them apart means this file can
// be the only thing that knows about classes, and /api/ask stays a plain
// question-in, answer-out route.
//
// Flag: the same preview-only gate as /api/ask (build-time NEXT_PUBLIC_AI_TOOLS
// AND a Vercel preview), so production answers 404 and keeps the old path.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { AI_TOOLS, aiToolsForEnv } from '@/lib/feature-flags';
import { UNSUPPORTED_REPLY } from '@/lib/tools/reply';
import { conversationIdFor } from '@/lib/chat-log/rows';
import { logGap, logTurn } from '@/lib/chat-log/write';
import { anthropicRouteCall, classify } from '@/lib/router/classify';
import { decideRoute, hasFigure } from '@/lib/router/decide';

const NO_STORE = { headers: { 'Cache-Control': 'no-store' } };
const Body = z.object({
  message: z.string().trim().min(1).max(500),
  // Optional: groups the turns of one conversation in the chat log.
  conversationId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  // Two gates, same as /api/ask: the build-time flag and a preview deployment.
  if (!AI_TOOLS || !aiToolsForEnv(process.env.VERCEL_ENV)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // No guest path: this decides where an owner's own account question goes.
  if (!user) {
    return NextResponse.json(
      { error: 'signed_out', reply: "You're signed out. Sign in, then ask me again." },
      { status: 401, ...NO_STORE },
    );
  }

  // Same bucket as /api/ask and /api/parse: one conversation-shaped AI surface,
  // one ceiling. The router is cheap, but it is still a paid call.
  if (!(await rateLimit('parse', rateIdentifier(req, user.id)))) {
    return NextResponse.json({ reply: 'One sec — slow down a moment.' }, { status: 429, ...NO_STORE });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ reply: 'Say that again?' }, { status: 400, ...NO_STORE });
  }

  // A digit or a "$" is a job on its face, so it is decided without a call:
  // the same rule the regex gate has, applied before the model is asked.
  const { message } = parsed.data;
  const askedAt = new Date();
  const classified = hasFigure(message) ? null : await classify(message, anthropicRouteCall());
  const decision = decideRoute({ flagOn: true, bypass: null, classified, text: message });

  // Log only what this route itself answers. An 'ask' message is logged by
  // /api/ask when it answers; a 'build' message goes on to /api/parse, which is
  // not logged. An 'unsupported' message is answered here, so it is logged here
  // and recorded as a help gap. Neither write can change the response.
  let messageId: string | null = null;
  let conversationId: string | null = null;
  if (decision.route === 'unsupported') {
    conversationId = conversationIdFor(parsed.data.conversationId);
    messageId = await logTurn(supabase, {
      userId: user.id,
      conversationId,
      question: message,
      reply: UNSUPPORTED_REPLY,
      route: 'unsupported',
      toolName: null,
      toolRowCount: null,
      model: null,
      latencyMs: Date.now() - askedAt.getTime(),
      tokensIn: null,
      tokensOut: null,
      askedAt,
      answeredAt: new Date(),
    });
    if (messageId) {
      await logGap(supabase, { userId: user.id, messageId, question: message, kind: 'unsupported' });
    }
  }

  return NextResponse.json(
    {
      route: decision.route,
      // Additive: the reply's id (for feedback) and conversation, only for an
      // 'unsupported' answer that was logged; null otherwise.
      messageId,
      conversationId,
      via: decision.via,
      // The one sentence this endpoint writes. It comes from the shared copy
      // helper, never from the model, and the model is not consulted again.
      reply: decision.route === 'unsupported' ? UNSUPPORTED_REPLY : null,
    },
    NO_STORE,
  );
}
