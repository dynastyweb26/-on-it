// POST /api/feedback — "Tell us about On It" (FEEDBACK-SPEC.md §3).
// Body: { tag, message, rating?, source?, screen?, appVersion? }.
//
// The user id comes from the session, never the body. The row is written with
// the service role (the table has no client INSERT), then the founder is
// emailed with Reply-To set to the user's account email so a reply from Zoho
// goes straight to them. A failed email is logged and never fails the
// submission: the row is already saved.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { getResend, emailFrom } from '@/lib/email/resend';
import { FeedbackBody, feedbackEmail } from '@/lib/feedback';

export const runtime = 'nodejs';

const OWNER = 'brandon@dynastyweb.co';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!(await rateLimit('feedback', rateIdentifier(req, user.id)))) {
    return NextResponse.json({ error: 'You have sent a few already. Try again in a bit.' }, { status: 429 });
  }

  const parsed = FeedbackBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Write at least a few words and pick a tag.' }, { status: 400 });
  }
  const b = parsed.data;

  const { error } = await adminClient().from('feedback').insert({
    user_id: user.id,
    tag: b.tag,
    message: b.message,
    rating: b.rating ?? null,
    source: b.source,
    screen: b.screen || null,
    app_version: b.appVersion || null,
  });
  if (error) {
    console.error('feedback insert failed', error.code);
    return NextResponse.json({ error: 'Couldn’t send that just now. Try again.' }, { status: 500 });
  }

  await notifyOwner(supabase, user.id, user.email ?? null, b);
  return NextResponse.json({ ok: true });
}

async function notifyOwner(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  userEmail: string | null,
  b: ReturnType<typeof FeedbackBody.parse>,
) {
  const resend = getResend();
  if (!resend) return; // dormant without RESEND_API_KEY; the row is the record
  try {
    const { data: prof } = await supabase
      .from('profiles').select('business_name').eq('id', userId).maybeSingle();
    const { subject, text, html } = feedbackEmail({
      tag: b.tag,
      message: b.message,
      rating: b.rating ?? null,
      source: b.source,
      screen: b.screen,
      appVersion: b.appVersion,
      businessName: (prof?.business_name as string | null | undefined) ?? null,
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
  } catch (e) {
    console.error('feedback email failed', (e as Error)?.message);
  }
}
