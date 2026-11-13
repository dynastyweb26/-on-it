// The /api/ask/feedback handler, kept out of the route file: Next only allows
// route handlers to export POST/GET/etc, so the testable body and ownership
// logic live here.
import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { FEEDBACK_NOTE_MAX, FeedbackReasonsSchema } from '@/lib/templates/reasons';
import { supabaseFeedbackStore } from '@/lib/templates/feedback-store';

const NO_STORE = { headers: { 'Cache-Control': 'no-store' } };

const Body = z.object({
  messageId: z.string().uuid(),
  /** null clears the vote; otherwise save or change it. */
  thumb: z.enum(['up', 'down']).nullable(),
  reasons: FeedbackReasonsSchema.default([]),
  note: z.string().max(FEEDBACK_NOTE_MAX).nullish(),
});

type FeedbackGuards = {
  limit: typeof rateLimit;
  identify: typeof rateIdentifier;
};

const GUARDS: FeedbackGuards = { limit: rateLimit, identify: rateIdentifier };

export async function handleFeedback(
  req: NextRequest,
  supabase: SupabaseClient,
  guards: FeedbackGuards = GUARDS,
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: 'signed_out', reply: "You're signed out. Sign in, then try again." },
      { status: 401, ...NO_STORE },
    );
  }

  // Same bucket as /api/ask and /api/parse: one conversation-shaped AI surface.
  if (!(await guards.limit('parse', guards.identify(req, user.id)))) {
    return NextResponse.json(
      { reply: 'One sec — slow down a moment.' },
      { status: 429, ...NO_STORE },
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_request', reply: 'That vote could not be saved.' },
      { status: 400, ...NO_STORE },
    );
  }
  const { messageId, thumb, reasons, note } = parsed.data;

  // RLS already hides another owner's message; the explicit filters make the
  // refusal a clear 403 instead of an upsert error.
  const { data: owned, error: readError } = await supabase
    .from('chat_messages')
    .select('id')
    .eq('id', messageId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (readError) {
    console.error('[ask/feedback] ownership check failed', readError.message);
    return NextResponse.json(
      { error: 'server_error', reply: 'That vote could not be saved.' },
      { status: 500, ...NO_STORE },
    );
  }
  if (!owned) {
    return NextResponse.json(
      { error: 'not_found', reply: 'That message is not available.' },
      { status: 403, ...NO_STORE },
    );
  }

  try {
    const store = supabaseFeedbackStore(supabase, user.id);
    if (thumb) {
      await store.save({ messageId, thumb, reasons, note });
    } else {
      await store.clear(messageId);
    }
    return NextResponse.json({ ok: true }, NO_STORE);
  } catch (e) {
    console.error('[ask/feedback] write failed', (e as Error)?.message);
    return NextResponse.json(
      { error: 'server_error', reply: 'That vote could not be saved.' },
      { status: 500, ...NO_STORE },
    );
  }
}
