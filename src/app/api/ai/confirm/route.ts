// POST /api/ai/confirm — execute the pending actions the owner confirmed.
//
// The model can only PROPOSE a write: the turn hands back confirm tokens, and
// this route is the one place a write or send tool actually runs. It is not a
// model route: no Anthropic call, no prose. The client sends tokens plus one
// idempotency key; the same key replayed returns the recorded result and writes
// nothing.
//
// Auth is the session user, and every read/write goes through the caller's own
// client, so RLS decides what a token can reach. No service role is imported
// here or by any tool (CI enforces that).
//
// Flag: the same preview-only gate as /api/ask and /api/route.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { AI_TOOLS, aiToolsForEnv } from '@/lib/feature-flags';
import { REGISTRY } from '@/lib/tools/registry';
import { supabaseToolDb } from '@/lib/tools/db';
import { supabasePendingStore } from '@/lib/tools/pending-store';
import { confirmActions, type ConfirmFailure } from '@/lib/tools/confirm';
import { aiEnvRefusal, logEnvRefusal } from '@/lib/tools/env-guard';

const NO_STORE = { headers: { 'Cache-Control': 'no-store' } };

const Body = z.object({
  /** Several proposals confirmed in one request. */
  tokens: z.array(z.string().min(8).max(512)).min(1).max(10).optional(),
  /** A single proposal, for a card with one button. */
  token: z.string().min(8).max(512).optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

/** What the user is told for each refusal. Names the real cause, no blame. */
const FAILURE: Record<ConfirmFailure, { status: number; reply: string }> = {
  unknown_token: { status: 404, reply: 'That confirmation has expired. Ask me again and I will redo it.' },
  expired_token: { status: 410, reply: 'That confirmation is too old. Ask me again and I will redo it.' },
  already_confirmed: { status: 409, reply: 'That one was already done.' },
  not_executable: { status: 400, reply: 'That action cannot be confirmed.' },
};

export async function POST(req: NextRequest) {
  if (!AI_TOOLS || !aiToolsForEnv(process.env.VERCEL_ENV)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  // Same production-database guard as /api/ask: a confirm writes, so this is
  // the route that must never run against the wrong project.
  const refusal = aiEnvRefusal({
    flagOn: AI_TOOLS,
    vercelEnv: process.env.VERCEL_ENV,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  if (refusal) {
    logEnvRefusal(refusal, 'confirm');
    return NextResponse.json(
      { error: refusal, reply: 'The assistant is not available on this preview.' },
      { status: 503, ...NO_STORE },
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: 'signed_out', reply: "You're signed out. Sign in, then confirm." },
      { status: 401, ...NO_STORE },
    );
  }

  if (!(await rateLimit('parse', rateIdentifier(req, user.id)))) {
    return NextResponse.json({ reply: 'One sec — slow down a moment.' }, { status: 429, ...NO_STORE });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid request', reply: 'Say that again?' }, { status: 400, ...NO_STORE });
  }

  const tokens = parsed.data.tokens ?? (parsed.data.token ? [parsed.data.token] : []);
  if (tokens.length === 0) {
    return NextResponse.json({ error: 'invalid request', reply: 'Say that again?' }, { status: 400, ...NO_STORE });
  }

  try {
    const result = await confirmActions({
      userId: user.id,
      tokens,
      idempotencyKey: parsed.data.idempotencyKey ?? null,
      store: supabasePendingStore(supabase, user.id),
      registry: REGISTRY,
      db: supabaseToolDb(supabase),
    });

    if (!result.ok) {
      const failure = FAILURE[result.reason];
      return NextResponse.json(
        { error: result.reason, reply: failure.reply },
        { status: failure.status, ...NO_STORE },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        replayed: result.replayed,
        actions: result.actions.map((action) => ({
          actionId: action.actionId,
          tool: action.tool,
          result: action.result,
        })),
      },
      NO_STORE,
    );
  } catch (e) {
    console.error('[confirm] failed', (e as Error)?.message);
    return NextResponse.json(
      { error: 'confirm_failed', reply: "That didn't go through. Tap it once more." },
      { status: 500, ...NO_STORE },
    );
  }
}
