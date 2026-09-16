// GET /api/trial-reminders — Vercel Cron target (see vercel.json), once daily.
//
// Trial users currently get charged with no warning. This run finds users whose
// 30-day trial ends within the next 3 days and who haven't already been sent the
// heads-up, verifies each is genuinely about to be charged, and emails them via
// Resend. Sent-state is tracked on profiles.trial_reminder_sent_at so a user can
// never be emailed twice.
//
// This is a SEPARATE cron from /api/followups (unpaid-invoice web-push nudges,
// gated by hasAccess for PAID users). The audiences are opposite — trial users
// about to convert vs. subscribers chasing their clients — so it reuses the
// followups infrastructure (CRON_SECRET auth, service-role admin client) rather
// than sharing its logic.
//
// Auth: Vercel injects `Authorization: Bearer ${CRON_SECRET}` on scheduled
// invocations; any request without it is rejected, so the public URL is inert.
//
// Service-role admin client is the legitimate, audited use here (no user
// session in a cron — same justification as the Stripe webhook). It reads/writes
// profiles across users, which RLS would otherwise scope to one owner.
import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase/admin';
import { getStripe } from '@/lib/stripe/server';
import { getResend, emailFrom } from '@/lib/email/resend';
import { trialReminderEmail } from '@/lib/email/trial-reminder';
import { PAYWALL_ENABLED } from '@/lib/paywall';
import { verifyCronAuth } from '@/lib/cron-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REMIND_WITHIN_DAYS = 3;
const MAX_PER_RUN = 200;

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://onit.dynastyweb.co').replace(/\/$/, '');
}

function fmtDate(iso: string): string {
  // Business timezone (Forney, TX / Central) so the date matches what the user
  // sees in Settings and the day the charge actually lands for them.
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Chicago',
  });
}

function fmtAmount(unitAmount: number | null | undefined, currency: string | null | undefined): string {
  if (unitAmount == null) return '$9.99'; // the locked On It price, if Stripe omits it
  const value = unitAmount / 100;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: (currency ?? 'usd').toUpperCase(),
    }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
}

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Paywall kill switch: no "your trial ends soon / you'll be charged" emails
  // while billing is switched off. The cron stays scheduled but no-ops.
  if (!PAYWALL_ENABLED) {
    return NextResponse.json({ skipped: 'paywall_disabled' });
  }

  // Dormant-safe: without email or billing configured there is nothing to do.
  const resend = getResend();
  const stripe = getStripe();
  if (!resend || !stripe) {
    return NextResponse.json({ skipped: 'email_or_billing_not_configured' });
  }

  const supabase = adminClient();
  const now = Date.now();
  const windowEnd = new Date(now + REMIND_WITHIN_DAYS * 24 * 3600e3).toISOString();
  const nowIso = new Date(now).toISOString();

  // Candidates: still trialing, trial ends within the window, not yet reminded,
  // and linked to a Stripe customer we can verify. The DB narrows the set; Stripe
  // is the source of truth for whether a charge is actually coming (below).
  const { data: candidates, error: qErr } = await supabase
    .from('profiles')
    .select('id, business_name, stripe_customer_id, trial_ends_at')
    .eq('access_tier', 'trialing')
    .not('stripe_customer_id', 'is', null)
    .not('trial_ends_at', 'is', null)
    .gt('trial_ends_at', nowIso)
    .lte('trial_ends_at', windowEnd)
    .is('trial_reminder_sent_at', null)
    .limit(MAX_PER_RUN);

  if (qErr) {
    console.error('trial-reminders query error', qErr);
    return NextResponse.json({ error: 'query failed' }, { status: 500 });
  }

  let sent = 0;
  let skippedNotChargeable = 0; // cancelled or no live trialing subscription
  let skippedNoEmail = 0;
  let failed = 0;

  for (const p of candidates ?? []) {
    // 1. Verify against Stripe RIGHT BEFORE sending. A user who cancelled keeps
    //    access_tier='trialing' but their subscription carries
    //    cancel_at_period_end=true (or is already gone) — they will NOT be
    //    charged, so they must NOT get a "you'll be charged" email. Checking live
    //    here also closes the race where someone cancels between this query and
    //    the send.
    let chargeable:
      | { trialEnd: string; amount: string }
      | null = null;
    try {
      const subs = await stripe.subscriptions.list({
        customer: p.stripe_customer_id as string,
        status: 'trialing',
        limit: 3,
      });
      const live = subs.data.find((s) => !s.cancel_at_period_end);
      if (live) {
        const price = live.items.data[0]?.price;
        chargeable = {
          trialEnd: live.trial_end ? new Date(live.trial_end * 1000).toISOString() : (p.trial_ends_at as string),
          amount: fmtAmount(price?.unit_amount, price?.currency),
        };
      }
    } catch (e) {
      // Transient Stripe failure: skip this user this run; the next daily run
      // retries (sent-state is untouched because we haven't claimed yet).
      console.error('trial-reminders stripe verify error', p.id, e);
      failed++;
      continue;
    }
    if (!chargeable) {
      skippedNotChargeable++;
      continue;
    }

    // 2. Resolve the email (profiles has none — it lives in auth.users).
    let email: string | undefined;
    try {
      const { data: u } = await supabase.auth.admin.getUserById(p.id as string);
      email = u?.user?.email ?? undefined;
    } catch (e) {
      console.error('trial-reminders getUserById error', p.id, e);
    }
    if (!email) {
      skippedNoEmail++;
      continue;
    }

    // 3. Claim BEFORE sending: stamp trial_reminder_sent_at only if still null.
    //    This is the at-most-once guarantee — a concurrent run or rerun that
    //    reaches the same row gets zero rows back and skips it.
    const { data: claimed, error: claimErr } = await supabase
      .from('profiles')
      .update({ trial_reminder_sent_at: new Date().toISOString() })
      .eq('id', p.id)
      .is('trial_reminder_sent_at', null)
      .select('id')
      .maybeSingle();
    if (claimErr) {
      console.error('trial-reminders claim error', p.id, claimErr);
      failed++;
      continue;
    }
    if (!claimed) continue; // someone else already claimed/sent it

    // 4. Send. On failure, release the claim so a later run can retry.
    try {
      const { subject, text, html } = trialReminderEmail({
        businessName: p.business_name as string | null,
        chargeDate: fmtDate(chargeable.trialEnd),
        amount: chargeable.amount,
        manageUrl: `${appUrl()}/settings`,
      });
      const { error: sendErr } = await resend.emails.send({
        from: emailFrom(),
        to: email,
        subject,
        text,
        html,
        replyTo: 'brandon@dynastyweb.co',
      });
      if (sendErr) throw sendErr;
      sent++;
    } catch (e) {
      console.error('trial-reminders send error', p.id, e);
      await supabase
        .from('profiles')
        .update({ trial_reminder_sent_at: null })
        .eq('id', p.id);
      failed++;
    }
  }

  return NextResponse.json({
    checked: candidates?.length ?? 0,
    sent,
    skippedNotChargeable,
    skippedNoEmail,
    failed,
  });
}
