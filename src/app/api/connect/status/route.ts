// POST /api/connect/status — re-read the seller's connected account from
// Stripe (Accounts v2) and mirror its status onto the profile. Called by
// Settings on return from onboarding and on load while setup is incomplete.
// POST (not GET) because it writes.
//
// The account id comes from the caller's own profile (session client, RLS),
// never from the request body, so a user can only refresh their own account.
// The write goes through the admin client (stripe_* columns aren't granted to
// authenticated). Dormant-safe: 503 without Stripe keys / the Connect switch.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe/server';
import {
  ACCOUNT_INCLUDE,
  capabilityStatuses,
  connectEnabled,
  statusFromV2Account,
  stripeErrorLog,
  writeConnectStatus,
} from '@/lib/stripe/connect';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';

export const runtime = 'nodejs';

const StatusBody = z.object({}).nullish();

// GET — is Connect switched on in this environment? Settings asks before
// rendering the Stripe card and shows the disabled "Coming soon" state unless
// this says enabled. Deliberately signed-out and data-free: it reports only
// the deployment's Connect switch (+ key presence), touches no profile and
// never calls Stripe. IP rate-limited. No NEXT_PUBLIC_ flag — the server's
// STRIPE_CONNECT_ENABLED stays the single source of truth.
export async function GET(req: NextRequest) {
  if (!(await rateLimit('connect_config', rateIdentifier(req)))) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }
  return NextResponse.json({ enabled: Boolean(getStripe()) && connectEnabled() });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!(await rateLimit('connect_status', rateIdentifier(req, user.id)))) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }

  if (!StatusBody.safeParse(await req.json().catch(() => ({}))).success) {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 });
  }

  const stripe = getStripe();
  if (!stripe || !connectEnabled()) {
    return NextResponse.json({ error: 'connect_not_configured' }, { status: 503 });
  }

  const { data: profile, error: readErr } = await supabase
    .from('profiles')
    .select('stripe_account_id, stripe_charges_enabled')
    .eq('id', user.id)
    .maybeSingle();
  if (readErr || !profile) {
    return NextResponse.json({ error: 'profile not found' }, { status: 404 });
  }
  if (!profile.stripe_account_id) {
    return NextResponse.json({ connected: false });
  }

  try {
    const account = await stripe.v2.core.accounts.retrieve(profile.stripe_account_id, {
      include: ACCOUNT_INCLUDE,
    });

    // Until the account is Connected, log the raw capability statuses so the
    // v2 mapping can be checked against what Stripe actually returns. Statuses
    // only: no requirement details, no account or personal info.
    if (!profile.stripe_charges_enabled) {
      console.log('connect status capabilities', JSON.stringify(capabilityStatuses(account)));
    }

    const status = statusFromV2Account(account);
    await writeConnectStatus(user.id, status);
    return NextResponse.json({
      connected: true,
      chargesEnabled: status.chargesEnabled,
      detailsSubmitted: status.detailsSubmitted,
      payoutsEnabled: status.payoutsEnabled,
    });
  } catch (e) {
    console.error('connect status error', stripeErrorLog(e));
    return NextResponse.json({ error: 'status failed' }, { status: 500 });
  }
}
