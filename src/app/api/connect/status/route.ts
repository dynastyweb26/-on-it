// POST /api/connect/status — re-read the seller's connected account from
// Stripe and mirror its status onto the profile. Called by Settings on return
// from onboarding and on load while setup is incomplete. POST (not GET)
// because it writes.
//
// The account id comes from the caller's own profile (session client, RLS),
// never from the request body, so a user can only refresh their own account.
// The write goes through the admin client (stripe_* columns aren't granted to
// authenticated). Dormant-safe: 503 without Stripe keys / the Connect switch.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe/server';
import { connectEnabled, statusFromAccount, writeConnectStatus } from '@/lib/stripe/connect';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';

export const runtime = 'nodejs';

const StatusBody = z.object({}).nullish();

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
    .select('stripe_account_id')
    .eq('id', user.id)
    .maybeSingle();
  if (readErr || !profile) {
    return NextResponse.json({ error: 'profile not found' }, { status: 404 });
  }
  if (!profile.stripe_account_id) {
    return NextResponse.json({ connected: false });
  }

  try {
    const account = await stripe.accounts.retrieve(profile.stripe_account_id);
    const status = statusFromAccount(account);
    await writeConnectStatus(user.id, status);
    return NextResponse.json({
      connected: true,
      chargesEnabled: status.chargesEnabled,
      detailsSubmitted: status.detailsSubmitted,
      payoutsEnabled: status.payoutsEnabled,
    });
  } catch (e) {
    // detail: the SDK attaches the underlying Node error on connection failures
    // (e.g. an invalid header), which type/message alone don't reveal.
    const err = e as { type?: string; code?: string; message?: string; detail?: { message?: string } };
    console.error('connect status error', JSON.stringify({ type: err?.type, code: err?.code, message: err?.message, detail: err?.detail?.message }));
    return NextResponse.json({ error: 'status failed' }, { status: 500 });
  }
}
