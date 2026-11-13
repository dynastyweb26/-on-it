// POST /api/ask/feedback — save, change or clear a thumbs vote.
//
// The vote belongs to one chat_messages row. The route checks that row under
// the CALLER'S session before writing anything, so another owner's message id
// is refused here; the table's RLS policy repeats the check as the real boundary.
// No service role, no migration.
import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
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

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  return handleFeedback(req, supabase);
}

/** Exported for the ownership test; the route itself only wraps this. */
export async function handleFeedback(req: NextRequest, supabase: SupabaseClient) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: 'signed_out', reply: "You're signed out. Sign in, then try again." },
      { status: 401, ...NO_STORE },
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
