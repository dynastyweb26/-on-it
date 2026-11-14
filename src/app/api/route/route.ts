// POST /api/route — Chat router, Slice 2.
//
// One message in, one route out. It sits BESIDE /api/ask and /api/parse and
// shares nothing with them but the rate-limit bucket: it reads nothing from the
// database, writes nothing, and never answers the message. Its only job is to
// say which of the two existing paths should handle it.
//
// A separate route rather than folding this into /api/ask on purpose: ask's
// contract is "question in, answer out" with a three-call tool loop, and a
// 'build' result is a signal, not a reply. Keeping them apart means this file can
// be the only thing that knows about classes, and /api/ask stays byte-identical.
//
// Flag: the same preview-only gate as /api/ask (build-time NEXT_PUBLIC_AI_TOOLS
// AND a Vercel preview), so production answers 404 and keeps the old path.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { AI_TOOLS, aiToolsForEnv } from '@/lib/feature-flags';
import { createTurnBudget } from '@/lib/tools/budget';
import { aiEnvRefusal, logEnvRefusal } from '@/lib/tools/env-guard';
import { anthropicRouteCall, classify } from '@/lib/router/classify';
import { decideRoute, hasFigure } from '@/lib/router/decide';

const NO_STORE = { headers: { 'Cache-Control': 'no-store' } };
const Body = z.object({ message: z.string().trim().min(1).max(500) });

export async function POST(req: NextRequest) {
  // Two gates, same as /api/ask: the build-time flag and a preview deployment.
  if (!AI_TOOLS || !aiToolsForEnv(process.env.VERCEL_ENV)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  // Same production-database guard as /api/ask.
  const refusal = aiEnvRefusal({
    flagOn: AI_TOOLS,
    vercelEnv: process.env.VERCEL_ENV,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  if (refusal) {
    logEnvRefusal(refusal, 'route');
    return NextResponse.json({ error: refusal }, { status: 503, ...NO_STORE });
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
  // This call comes out of the SAME per-turn budget /api/ask spends from: the
  // client sends one x-turn-id on both requests. A turn out of calls falls back
  // to the deterministic rules instead of spending another one.
  const budget = createTurnBudget({ userId: user.id, turnId: req.headers.get('x-turn-id') });
  const classified = hasFigure(message) || !(await budget.spend())
    ? null
    : await classify(message, anthropicRouteCall());
  const decision = decideRoute({ flagOn: true, bypass: null, classified, text: message });

  return NextResponse.json(
    {
      route: decision.route,
      via: decision.via,
      // This endpoint writes no text. Every route is a question in the end:
      // /api/ask answers it, or composes the cant.do card when nothing can.
      reply: null,
    },
    NO_STORE,
  );
}
