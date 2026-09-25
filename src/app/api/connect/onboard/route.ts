// POST /api/connect/onboard — start (or resume) Stripe Connect onboarding.
// Creates the seller's Standard account on first use, then returns a
// Stripe-hosted Account Link. The client redirects to it (fetch → location,
// same as checkout — CSP form-action is 'self').
//
// User request → session client for the read; the account id write goes
// through the admin client because stripe_account_id is not granted to
// authenticated. Dormant-safe: 503 when Stripe keys or the Connect switch are
// absent.
//
// Race safety: two concurrent first clicks must not create two accounts.
//   1. accounts.create carries an idempotency key per user, so Stripe returns
//      the SAME account to a duplicate request (within Stripe's 24h window).
//   2. The id is stored with `.is('stripe_account_id', null)`, so only the
//      first writer lands; a loser re-reads and uses the stored id.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { getStripe } from '@/lib/stripe/server';
import { connectEnabled } from '@/lib/stripe/connect';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';

export const runtime = 'nodejs';

// No meaningful body — validate anyway (security pattern).
const OnboardBody = z.object({}).nullish();

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!(await rateLimit('connect_onboard', rateIdentifier(req, user.id)))) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }

  if (!OnboardBody.safeParse(await req.json().catch(() => ({}))).success) {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 });
  }

  const stripe = getStripe();
  if (!stripe || !connectEnabled()) {
    return NextResponse.json(
      { error: 'connect_not_configured', message: 'Card payments aren’t available yet — hang tight.' },
      { status: 503 }
    );
  }

  const { data: profile, error: readErr } = await supabase
    .from('profiles')
    .select('stripe_account_id, business_name')
    .eq('id', user.id)
    .maybeSingle();
  if (readErr || !profile) {
    return NextResponse.json({ error: 'profile not found' }, { status: 404 });
  }

  try {
    let accountId: string | null = profile.stripe_account_id ?? null;

    if (!accountId) {
      const account = await stripe.accounts.create(
        {
          type: 'standard',
          email: user.email ?? undefined,
          business_profile: profile.business_name ? { name: profile.business_name } : undefined,
          metadata: { user_id: user.id },
        },
        { idempotencyKey: `connect-account-${user.id}` }
      );

      const admin = adminClient();
      const { data: claimed, error: updErr } = await admin
        .from('profiles')
        .update({ stripe_account_id: account.id })
        .eq('id', user.id)
        .is('stripe_account_id', null)
        .select('stripe_account_id')
        .maybeSingle();
      if (updErr) throw updErr;

      if (claimed?.stripe_account_id) {
        accountId = claimed.stripe_account_id;
      } else {
        // Lost the race — another request stored an id first. Use that one.
        const { data: again, error: againErr } = await admin
          .from('profiles').select('stripe_account_id').eq('id', user.id).maybeSingle();
        if (againErr) throw againErr;
        accountId = again?.stripe_account_id ?? null;
      }
      if (!accountId) throw new Error('connect: account id not stored');
    }

    const origin = req.nextUrl.origin;
    const link = await stripe.accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      // refresh_url: the link expired or was reused — Settings re-requests one.
      refresh_url: `${origin}/settings?connect=refresh`,
      // return_url: the seller left onboarding (finished OR not) — Settings
      // re-reads the account status; this is not proof of completion.
      return_url: `${origin}/settings?connect=return`,
    });
    return NextResponse.json({ url: link.url });
  } catch (e) {
    const err = e as { type?: string; code?: string; message?: string };
    console.error('connect onboard error', JSON.stringify({ type: err?.type, code: err?.code, message: err?.message }));
    return NextResponse.json(
      { error: 'onboard failed', message: 'We couldn’t reach Stripe just now. Please try again.' },
      { status: 500 }
    );
  }
}
