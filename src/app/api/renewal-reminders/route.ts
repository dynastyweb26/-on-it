// GET /api/renewal-reminders — Vercel Cron target (see vercel.json), once daily.
//
// Yearly reminder for paying subscribers (California automatic-renewal law,
// DRAFT timing/wording pending attorney review): within 14 days of each
// anniversary of the subscription's start, email the price, the next charge
// date and the cancel link. Sent-state is profiles.renewal_reminder_sent_at,
// claimed BEFORE sending so a rerun or overlap can't double-send.
//
// Same shape as /api/trial-reminders: CRON_SECRET auth, paywall kill switch,
// service-role admin client (cron has no user session), Stripe verified live
// right before sending (a subscriber who cancelled gets nothing).
import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase/admin';
import { getStripe } from '@/lib/stripe/server';
import { getResend, emailFrom } from '@/lib/email/resend';
import { PAYWALL_ENABLED } from '@/lib/paywall';
import { verifyCronAuth } from '@/lib/cron-auth';
import { periodEndISO } from '@/lib/subscription/state';
import { RENEWAL_REMIND_WITHIN_DAYS, renewalReminderDue, renewalReminderEmail } from '@/lib/renewal-reminder';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_PER_RUN = 200;

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://onit.dynastyweb.co').replace(/\/$/, '');
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Chicago',
  });
}

function fmtAmount(unitAmount: number | null | undefined, currency: string | null | undefined): string {
  if (unitAmount == null) return '$9.99';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: (currency ?? 'usd').toUpperCase() }).format(unitAmount / 100);
  } catch {
    return `$${(unitAmount / 100).toFixed(2)}`;
  }
}

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!PAYWALL_ENABLED) return NextResponse.json({ skipped: 'paywall_disabled' });

  const resend = getResend();
  const stripe = getStripe();
  if (!resend || !stripe) return NextResponse.json({ skipped: 'email_or_billing_not_configured' });

  const supabase = adminClient();
  const now = new Date();
  // A subscription can't be a year old before the account is (365 − 14) days
  // old, so this keeps the daily Stripe checks to long-standing accounts.
  const oldEnough = new Date(now.getTime() - (365 - RENEWAL_REMIND_WITHIN_DAYS) * 24 * 3600e3).toISOString();

  const { data: candidates, error: qErr } = await supabase
    .from('profiles')
    .select('id, business_name, stripe_customer_id, renewal_reminder_sent_at')
    .eq('access_tier', 'active')
    .not('stripe_customer_id', 'is', null)
    .lte('created_at', oldEnough)
    .order('created_at', { ascending: true })
    .limit(MAX_PER_RUN);

  if (qErr) {
    // 42703 = column missing: the migration isn't applied yet. No-op, don't 500 daily.
    if (qErr.code === '42703') return NextResponse.json({ skipped: 'migration_not_applied' });
    console.error('renewal-reminders query error', qErr);
    return NextResponse.json({ error: 'query failed' }, { status: 500 });
  }

  let sent = 0, notDue = 0, notChargeable = 0, noEmail = 0, failed = 0;

  for (const p of candidates ?? []) {
    const prev = (p.renewal_reminder_sent_at as string | null) ?? null;

    let info: { startUnix: number; amount: string; nextCharge: string } | null = null;
    try {
      const subs = await stripe.subscriptions.list({ customer: p.stripe_customer_id as string, status: 'active', limit: 3 });
      const live = subs.data.find((s) => !s.cancel_at_period_end && !s.pause_collection);
      if (live) {
        const price = live.items.data[0]?.price;
        const end = periodEndISO(live as never);
        if (end) info = { startUnix: live.start_date, amount: fmtAmount(price?.unit_amount, price?.currency), nextCharge: fmtDate(end) };
      }
    } catch (e) {
      console.error('renewal-reminders stripe error', p.id, e);
      failed++;
      continue;
    }
    if (!info) { notChargeable++; continue; }
    if (!renewalReminderDue(info.startUnix, prev, now).due) { notDue++; continue; }

    let email: string | undefined;
    try {
      const { data: u } = await supabase.auth.admin.getUserById(p.id as string);
      email = u?.user?.email ?? undefined;
    } catch (e) {
      console.error('renewal-reminders getUserById error', p.id, e);
    }
    if (!email) { noEmail++; continue; }

    // Claim before sending: only if the stamp is still what we read.
    const claimQ = supabase.from('profiles').update({ renewal_reminder_sent_at: now.toISOString() }).eq('id', p.id);
    const { data: claimed, error: claimErr } = await (prev === null
      ? claimQ.is('renewal_reminder_sent_at', null)
      : claimQ.eq('renewal_reminder_sent_at', prev)
    ).select('id').maybeSingle();
    if (claimErr) { console.error('renewal-reminders claim error', p.id, claimErr); failed++; continue; }
    if (!claimed) continue;

    try {
      const { subject, text, html } = renewalReminderEmail({
        businessName: p.business_name as string | null,
        amount: info.amount,
        nextChargeDate: info.nextCharge,
        manageUrl: `${appUrl()}/settings`,
      });
      const { error: sendErr } = await resend.emails.send({
        from: emailFrom(), to: email, subject, text, html, replyTo: 'brandon@dynastyweb.co',
      });
      if (sendErr) throw sendErr;
      sent++;
    } catch (e) {
      console.error('renewal-reminders send error', p.id, e);
      await supabase.from('profiles').update({ renewal_reminder_sent_at: prev }).eq('id', p.id);
      failed++;
    }
  }

  return NextResponse.json({ checked: candidates?.length ?? 0, sent, notDue, notChargeable, noEmail, failed });
}
