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
import { UNSUPPORTED_REPLY } from '@/lib/tools/reply';
import { anthropicRouteCall, classify } from '@/lib/router/classify';
import { decideRoute } from '@/lib/router/decide';

const NO_STORE = { headers: { 'Cache-Control': 'no-store' } };
const Body = z.object({ message: z.string().trim().min(1).max(500) });

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

  // One model call. classify() is total: timeout, error and garbage are null,
  // and decideRoute() turns null into the pre-Slice-2 regex gate + parse.
  const classified = await classify(parsed.data.message, anthropicRouteCall());
  const decision = decideRoute({
    flagOn: true,
    bypass: null,
    classified,
    text: parsed.data.message,
  });

  return NextResponse.json(
    {
      route: decision.route,
      via: decision.via,
      // The one sentence this endpoint writes. It comes from the shared copy
      // helper, never from the model, and the model is not consulted again.
      reply: decision.route === 'unsupported' ? UNSUPPORTED_REPLY : null,
    },
    NO_STORE,
  );
}
