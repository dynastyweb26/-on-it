// POST /api/connect/onboard — start (or resume) Stripe Connect onboarding.
// Creates the seller's connected account (Accounts v2, merchant
// configuration, full Stripe Dashboard) on first use, then returns a
// Stripe-hosted onboarding link. The client redirects to it (fetch → location,
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
import {
  ACCOUNT_INCLUDE,
  accountIdempotencyKey,
  connectEnabled,
  stripeErrorLog,
} from '@/lib/stripe/connect';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';

export const runtime = 'nodejs';

// No meaningful body — validate anyway (security pattern).
const OnboardBody = z.object({}).nullish();

// The name Stripe shows for the account: business name, else the user's full
// name (auth metadata, if a provider ever sets it — email sign-up doesn't),
// else their email.
function displayName(
  businessName: string | null | undefined,
  meta: Record<string, unknown> | undefined,
  email: string | undefined
): string | undefined {
  const pick = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  return pick(businessName) ?? pick(meta?.full_name) ?? pick(meta?.name) ?? pick(email);
}

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
      const account = await stripe.v2.core.accounts.create(
        {
          display_name: displayName(profile.business_name, user.user_metadata, user.email),
          contact_email: user.email ?? undefined,
          // On It is US-only (Zelle / Cash App / Venmo, USD).
          identity: { country: 'us' },
          // Full Stripe Dashboard — the v2 equivalent of a Standard account.
          dashboard: 'full',
          defaults: {
            responsibilities: {
              fees_collector: 'stripe', // Stripe bills its fees to the seller; no application fee
              losses_collector: 'stripe', // Stripe owns negative balances, as with Standard
            },
          },
          configuration: {
            // Merchant of record → direct charges.
            merchant: { capabilities: { card_payments: { requested: true } } },
          },
          include: ACCOUNT_INCLUDE,
          metadata: { user_id: user.id },
        },
        { idempotencyKey: accountIdempotencyKey(user.id) }
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
    const link = await stripe.v2.core.accountLinks.create({
      account: accountId,
      use_case: {
        type: 'account_onboarding',
        account_onboarding: {
          configurations: ['merchant'],
          // refresh_url: the link expired or was reused — Settings re-requests one.
          refresh_url: `${origin}/settings?connect=refresh`,
          // return_url: the seller left onboarding (finished OR not) — Settings
          // re-reads the account status; this is not proof of completion.
          return_url: `${origin}/settings?connect=return`,
        },
      },
    });
    return NextResponse.json({ url: link.url });
  } catch (e) {
    console.error('connect onboard error', stripeErrorLog(e));
    return NextResponse.json(
      { error: 'onboard failed', message: 'We couldn’t reach Stripe just now. Please try again.' },
      { status: 500 }
    );
  }
}
