// POST /api/ask/feedback — a thumbs up/down on one AI chat answer.
//
// (Not /api/feedback: that route is "Tell us about On It", which emails the
// founder. This one lives beside /api/ask, which it belongs to.)
//
// Body: { messageId, rating: 1 | -1, reason? }. The user id comes from the
// session, never the body. The message must be the caller's own assistant
// message; anything else is a 404, so the route never confirms that another
// user's message exists. A vote is one row per (user, message): changing it is
// an upsert on that unique constraint.
//
// A thumbs-down also records a help gap (the question that got a bad answer).
// A gap that fails to save never fails the vote: the vote is the point.
//
// Writes run under the caller's own session, RLS on; no service role. Flag: the
// same preview-only gate as /api/ask and /api/route.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { AI_TOOLS, aiToolsForEnv } from '@/lib/feature-flags';
import {
  FeedbackBody,
  gapKindForVote,
  normalizeReason,
  type ChatRoute,
} from '@/lib/chat-log/rows';
import { logGap } from '@/lib/chat-log/write';

const NO_STORE = { headers: { 'Cache-Control': 'no-store' } };

export async function POST(req: NextRequest) {
  if (!AI_TOOLS || !aiToolsForEnv(process.env.VERCEL_ENV)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'signed_out' }, { status: 401, ...NO_STORE });
  }

  // Same bucket as the other chat routes: one conversation-shaped surface.
  if (!(await rateLimit('parse', rateIdentifier(req, user.id)))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, ...NO_STORE });
  }

  const parsed = FeedbackBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400, ...NO_STORE });
  }
  const { messageId, rating } = parsed.data;
  const reason = normalizeReason(parsed.data.reason);

  // Ownership: the caller's own ASSISTANT message. RLS enforces it a second
  // time on the write below.
  const { data: message, error: findError } = await supabase
    .from('chat_messages')
    .select('id, conversation_id, route, created_at')
    .eq('id', messageId)
    .eq('user_id', user.id)
    .eq('role', 'assistant')
    .maybeSingle();
  if (findError) {
    console.error('[chat-log] message lookup failed', { code: findError.code, message: findError.message });
    return NextResponse.json({ error: 'server_error' }, { status: 500, ...NO_STORE });
  }
  if (!message) {
    return NextResponse.json({ error: 'not_found' }, { status: 404, ...NO_STORE });
  }

  const { error: voteError } = await supabase
    .from('chat_feedback')
    .upsert(
      { user_id: user.id, message_id: messageId, rating, reason },
      { onConflict: 'user_id,message_id' },
    );
  if (voteError) {
    console.error('[chat-log] vote save failed', { code: voteError.code, message: voteError.message });
    return NextResponse.json({ error: 'save_failed' }, { status: 500, ...NO_STORE });
  }

  // A bad answer is a help gap, with the question it was an answer to.
  let gap = false;
  const kind = gapKindForVote({ rating, messageRoute: (message.route as ChatRoute | null) ?? null });
  if (kind) {
    try {
      const { data: question } = await supabase
        .from('chat_messages')
        .select('text')
        .eq('conversation_id', message.conversation_id)
        .eq('user_id', user.id)
        .eq('role', 'user')
        .lte('created_at', message.created_at)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (question?.text) {
        gap = await logGap(supabase, { userId: user.id, messageId, question: question.text, kind });
      }
    } catch (e) {
      console.error('[chat-log] gap lookup failed', (e as Error)?.message);
    }
  }

  return NextResponse.json({ ok: true, rating, gap }, NO_STORE);
}
