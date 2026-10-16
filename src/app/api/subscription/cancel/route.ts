// POST /api/subscription/cancel — cancel at period end (CANCEL-FLOW-SPEC.md
// §4, D2). Access stays until the period (or trial) ends; nothing is deleted.
// Body: { reason?, detail? } — both optional, a missing or unknown reason
// never blocks the cancel (spec rule 6).
//
// Writes the Stripe change, mirrors it onto the profile right away through
// the same mapping the webhook uses (so a refresh shows the canceling state),
// logs a cancel_events row, and sends the confirmation email.
import { NextRequest, NextResponse } from 'next/server';
import { applySubscription } from '@/lib/subscription/sync';
import { accessEndsISO } from '@/lib/subscription/state';
import { cleanDetail, isCancelReason, STRIPE_FEEDBACK } from '@/lib/subscription/reasons';
import { fail, logEvent, subscriptionContext } from '@/lib/subscription/route';
import { fmtPlanDate, freePlanLabel } from '@/lib/subscription/copy';
import { displayLimit } from '@/lib/access';
import { createClient } from '@/lib/supabase/server';
import { getResend, emailFrom } from '@/lib/email/resend';
import { cancellationEmail } from '@/lib/email/cancellation';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const ctx = await subscriptionContext(req);
  if (ctx instanceof NextResponse) return ctx;
  const { userId, stripe, sub } = ctx;

  const body = (await req.json().catch(() => ({}))) as { reason?: unknown; detail?: unknown };
  const reason = isCancelReason(body?.reason) ? body.reason : null;
  const detail = cleanDetail(reason, body?.detail);

  // Already canceling: same answer, no second log row.
  if (sub.cancel_at_period_end) {
    return NextResponse.json({ ok: true, endsAt: accessEndsISO(sub) });
  }

  let updated;
  try {
    updated = await stripe.subscriptions.update(sub.id, {
      cancel_at_period_end: true,
      ...(reason ? { cancellation_details: { feedback: STRIPE_FEEDBACK[reason] } } : {}),
    });
  } catch (e) {
    console.error('subscription cancel failed', (e as Error)?.message);
    return fail(502, 'Couldn’t cancel just now. Try again in a moment.');
  }

  try { await applySubscription(updated, userId); } catch (e) {
    // The webhook will record it; the cancel itself already succeeded.
    console.error('subscription cancel: profile sync failed', (e as { code?: string })?.code);
  }
  await logEvent(userId, { kind: 'cancel', reason, detail });

  const endsAt = accessEndsISO(updated);
  await sendConfirmation(req, ctx.email, ctx.profile.business_name, endsAt);

  return NextResponse.json({ ok: true, endsAt });
}

/** Cancellation confirmation (Resend, existing sender). Never fails the
 *  cancel: dormant without RESEND_API_KEY, and a send error is logged only. */
async function sendConfirmation(req: NextRequest, to: string | null, businessName: string | null, endsAt: string | null) {
  const resend = getResend();
  if (!resend || !to) return;
  try {
    const supabase = await createClient();
    const [{ data: inv }, { data: exp }] = await Promise.all([
      supabase.rpc('free_invoice_limit'),
      supabase.rpc('free_expense_limit'),
    ]);
    const { subject, text, html } = cancellationEmail({
      businessName,
      endsOn: fmtPlanDate(endsAt),
      freePlan: freePlanLabel({ invoices: displayLimit(inv), expenses: displayLimit(exp) }),
      manageUrl: `${req.nextUrl.origin}/settings/plan`,
    });
    const { error } = await resend.emails.send({
      from: emailFrom(), to, subject, text, html, replyTo: 'brandon@dynastyweb.co',
    });
    if (error) throw error;
  } catch (e) {
    console.error('cancellation email failed', (e as Error)?.message);
  }
}
