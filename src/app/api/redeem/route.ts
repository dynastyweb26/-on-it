// POST /api/redeem — redeem an access code (e.g. the founder code) for the
// signed-in user.
//
// The ONLY way to redeem a code: redeem_grant_for() is service-role only
// (20261001000003) and the old client RPC redeem_grant lost client EXECUTE, so
// guessing has to come through here, rate-limited to 5 an hour per user.
// The user id comes from the session, never the body. Codes match EXACTLY —
// case-sensitive, no lowercasing; only surrounding whitespace (a stray space
// from a phone keyboard) is trimmed.
//
// A wrong, expired or used-up code all get the same answer, so the endpoint
// never reveals whether a code exists.
//
// A user who redeems while subscribed (trialing / active / past_due) has every
// live subscription set to cancel_at_period_end, so a founder is never billed
// again; the reply says so (or, if Stripe can't be reached, asks them to
// cancel in Settings).
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { getStripe } from '@/lib/stripe/server';

const Body = z.object({ code: z.string().trim().min(3).max(40) });

const INVALID = "That code didn't work. Codes are case-sensitive, so check the capital letters.";

// Statuses Stripe will still charge for. A founder must never be billed again.
const BILLABLE: ReadonlySet<string> = new Set(['trialing', 'active', 'past_due']);

/** After a successful redeem: set cancel_at_period_end on every live
 *  subscription of this user's Stripe customer, so they keep what they paid
 *  for and are never charged again (a trial simply ends without a charge).
 *  The webhook then records the change without touching the founder tier.
 *  'none' = nothing to cancel; 'failed' = Stripe couldn't be reached. */
async function stopBilling(userId: string): Promise<'stopped' | 'none' | 'failed'> {
  const { data: profile } = await adminClient()
    .from('profiles').select('stripe_customer_id').eq('id', userId).maybeSingle();
  const customer = profile?.stripe_customer_id as string | null | undefined;
  if (!customer) return 'none';
  const stripe = getStripe();
  if (!stripe) return 'failed';
  try {
    const subs = await stripe.subscriptions.list({ customer, status: 'all', limit: 20 });
    const live = subs.data.filter((s) => BILLABLE.has(s.status) && !s.cancel_at_period_end);
    if (live.length === 0) return 'none';
    await Promise.all(live.map((s) => stripe.subscriptions.update(s.id, { cancel_at_period_end: true })));
    return 'stopped';
  } catch (e) {
    console.error('redeem: stopping billing failed', (e as Error)?.message);
    return 'failed';
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: 'Sign in first.' }, { status: 401 });

  if (!(await rateLimit('redeem', rateIdentifier(req, user.id)))) {
    return NextResponse.json(
      { ok: false, message: 'Too many tries. Wait a bit and try again.' },
      { status: 429 },
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false, message: INVALID }, { status: 400 });

  const { data, error } = await adminClient().rpc('redeem_grant_for', {
    p_user_id: user.id,
    p_token: parsed.data.code,
  });
  if (error) {
    console.error('redeem_grant_for failed', error.code ?? error.message);
    return NextResponse.json({ ok: false, message: "Couldn't check that code just now. Try again." }, { status: 500 });
  }

  switch (data as string) {
    case 'ok': {
      const billing = await stopBilling(user.id);
      const message = billing === 'stopped'
        ? "You're set. Free access is on. Your subscription won't renew."
        : billing === 'failed'
          ? "You're set. Free access is on. Cancel your subscription in Settings so you're not charged."
          : "You're set. Free access is on.";
      return NextResponse.json({ ok: true, tier: 'founder', message });
    }
    case 'already_founder':
      return NextResponse.json({ ok: false, message: 'You already have free access.' });
    case 'already_redeemed':
      return NextResponse.json({ ok: false, message: "You've already used this code." });
    case 'no_profile':
      return NextResponse.json({ ok: false, message: 'Finish setting up your account first.' });
    default:
      return NextResponse.json({ ok: false, message: INVALID });
  }
}
