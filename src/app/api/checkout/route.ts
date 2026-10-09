// POST /api/checkout — Stripe hosted Checkout (mode: subscription). A 14-day
// trial (card collected at Checkout) for first-time customers only; anyone who
// has had a trial or a subscription before is billed from day one
// (lib/trial.ts).
// User request (session client, NOT admin). Dormant without Stripe env: returns
// 503 with a clear message the paywall modal displays inline — never crashes.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe/server';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { TRIAL_DAYS, trialEligible } from '@/lib/trial';

// The price is server-side. The only input is where to come back to: the
// screen that showed the wall (chat keeps the blocked invoice card in local
// storage, so the user lands back on it and can send). A fixed whitelist of
// in-app paths, never a URL. Validated anyway (security pattern).
const RETURN_PATHS = { chat: '/chat', summary: '/summary', books: '/dashboard', invoices: '/invoices', settings: '/settings' } as const;
const CheckoutBody = z.object({ returnTo: z.enum(['chat', 'summary', 'books', 'invoices', 'settings']).optional() }).nullish();

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!(await rateLimit('checkout', rateIdentifier(req, user.id)))) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }

  const body = CheckoutBody.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 });
  }
  const returnPath = RETURN_PATHS[body.data?.returnTo ?? 'settings'];

  const stripe = getStripe();
  const price = process.env.STRIPE_PRICE_ID_MONTHLY?.trim(); // stray env whitespace → invalid price id
  // Dormant path: billing not configured yet (no keys tonight).
  if (!stripe || !price) {
    return NextResponse.json(
      { error: 'billing_not_configured', message: 'Payments aren’t live yet — hang tight, we’ll let you know.' },
      { status: 503 }
    );
  }

  // Reuse an existing Stripe customer if the webhook already linked one.
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id, trial_ends_at, subscription_status')
    .eq('id', user.id)
    .maybeSingle();

  try {
    // One trial per customer: the profile's record first, then Stripe itself
    // (any earlier subscription on this customer, whatever its status). If
    // Stripe can't be asked, the profile's answer stands.
    let withTrial = trialEligible(profile);
    if (withTrial && profile?.stripe_customer_id) {
      try {
        const prior = await stripe.subscriptions.list({ customer: profile.stripe_customer_id, status: 'all', limit: 1 });
        if (prior.data.length > 0) withTrial = false;
      } catch (e) {
        console.error('checkout: prior-subscription lookup failed', (e as Error)?.message);
      }
    }

    const origin = req.nextUrl.origin;
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      subscription_data: {
        ...(withTrial ? { trial_period_days: TRIAL_DAYS } : {}),
        metadata: { user_id: user.id },
      },
      // Existing customer, else let Checkout create one from the email; either
      // way the webhook stores the customer id back on the profile.
      ...(profile?.stripe_customer_id
        ? { customer: profile.stripe_customer_id }
        : { customer_email: user.email }),
      client_reference_id: user.id, // webhook maps the session back to the user
      metadata: { user_id: user.id },
      // {CHECKOUT_SESSION_ID} is filled in by Stripe; the return confirms the
      // session with /api/checkout/confirm (lib/upgrade-return).
      success_url: `${origin}${returnPath}?upgraded=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${returnPath}`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error('checkout error', e);
    return NextResponse.json({ error: 'checkout failed' }, { status: 500 });
  }
}
