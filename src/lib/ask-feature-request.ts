// The /api/ask/request-feature handler, kept out of the route file: Next only
// allows route handlers to export POST/GET/etc, so the testable body lives here.
//
// A feature request is attached to one chat turn. The server reads the question
// from that turn under the caller's session; request text never comes from the
// browser. The help_gaps unique index makes a retry idempotent, and the email
// is sent only after a new row is written.
import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { feedbackEmail } from '@/lib/feedback';

const NO_STORE = { headers: { 'Cache-Control': 'no-store' } };
const OWNER = 'brandon@dynastyweb.co';

const Body = z.object({ messageId: z.string().uuid() });

type FeatureRequestGuards = {
  limit: typeof rateLimit;
  identify: typeof rateIdentifier;
};

export type FeatureRequestEmail = (input: {
  question: string;
  userId: string;
  userEmail: string | null;
}) => Promise<void>;

const GUARDS: FeatureRequestGuards = { limit: rateLimit, identify: rateIdentifier };

/** Existing feedback content helper, with Reply-To pointing at the requester. */
const EMAIL: FeatureRequestEmail = async ({ question, userEmail }) => {
  // Loaded inside the send path so tests can inject a notifier without
  // importing the server-only Resend module.
  const { getResend, emailFrom } = await import('@/lib/email/resend');
  const resend = getResend();
  if (!resend) return; // dormant without RESEND_API_KEY; the row is the record
  const { subject, text, html } = feedbackEmail({
    tag: 'idea',
    message: `Feature request from chat:\n\n${question}`,
    source: 'chat_prompt',
    userEmail,
  });
  const { error } = await resend.emails.send({
    from: emailFrom(),
    to: OWNER,
    subject,
    text,
    html,
    ...(userEmail ? { replyTo: userEmail } : {}),
  });
  if (error) throw error;
};

const ok = () => NextResponse.json({ ok: true }, NO_STORE);

export async function handleFeatureRequest(
  req: NextRequest,
  supabase: SupabaseClient,
  guards: FeatureRequestGuards = GUARDS,
  email: FeatureRequestEmail = EMAIL,
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: 'signed_out', reply: "You're signed out. Sign in, then try again." },
      { status: 401, ...NO_STORE },
    );
  }

  // Same bucket as /api/ask and /api/ask/feedback.
  if (!(await guards.limit('parse', guards.identify(req, user.id)))) {
    return NextResponse.json(
      { reply: 'One sec — slow down a moment.' },
      { status: 429, ...NO_STORE },
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_request', reply: 'That feature request could not be sent.' },
      { status: 400, ...NO_STORE },
    );
  }
  const { messageId } = parsed.data;

  // Read the question from the caller's own turn. RLS hides another owner's
  // row; the explicit filters make the refusal a clear 403.
  const { data: owned, error: readError } = await supabase
    .from('chat_messages')
    .select('id, user_text')
    .eq('id', messageId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (readError) {
    console.error('[ask/request-feature] ownership check failed', readError.message);
    return NextResponse.json(
      { error: 'server_error', reply: 'That feature request could not be sent.' },
      { status: 500, ...NO_STORE },
    );
  }
  if (!owned?.user_text) {
    return NextResponse.json(
      { error: 'not_found', reply: 'That message is not available.' },
      { status: 403, ...NO_STORE },
    );
  }

  // A retry is successful and silent: no second row, no second email.
  const { data: existing, error: existingError } = await supabase
    .from('help_gaps')
    .select('id')
    .eq('user_id', user.id)
    .eq('message_id', messageId)
    .maybeSingle();
  if (existingError) {
    console.error('[ask/request-feature] existing request check failed', existingError.message);
    return NextResponse.json(
      { error: 'server_error', reply: 'That feature request could not be sent.' },
      { status: 500, ...NO_STORE },
    );
  }
  if (existing) return ok();

  const { error: insertError } = await supabase.from('help_gaps').insert({
    user_id: user.id,
    request_text: owned.user_text,
    source: 'chat_request',
    message_id: messageId,
  });
  if (insertError) {
    // A concurrent retry lost the unique-index race. The first insert owns the
    // row and the email, so this is still a successful retry.
    if (insertError.code === '23505') return ok();
    console.error('[ask/request-feature] insert failed', insertError.code);
    return NextResponse.json(
      { error: 'server_error', reply: 'That feature request could not be sent.' },
      { status: 500, ...NO_STORE },
    );
  }

  // The row is the record. A missing key or a failed send is logged, never
  // turned into a failed request.
  try {
    await email({
      question: owned.user_text,
      userId: user.id,
      userEmail: user.email ?? null,
    });
  } catch (e) {
    console.error('[ask/request-feature] email failed', (e as Error)?.message);
  }

  return ok();
}
