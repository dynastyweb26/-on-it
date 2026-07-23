// POST /api/billing-portal — Stripe hosted Billing Portal session.
// This IS the entire manage/cancel/update-card path (no custom cancel UI).
// User request → session client (not admin). Dormant-safe: returns 503 with a
// friendly message when Stripe isn't configured or the profile has no Stripe
// customer yet, so it never crashes.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe/server';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!(await rateLimit('billing_portal', rateIdentifier(req, user.id)))) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }

  const stripe = getStripe();
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .maybeSingle();

  // No keys, or no Stripe customer on this profile yet → nothing to manage.
  if (!stripe || !profile?.stripe_customer_id) {
    return NextResponse.json(
      { error: 'billing_not_configured', message: 'Billing management isn’t available yet.' },
      { status: 503 }
    );
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${req.nextUrl.origin}/settings`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error('billing portal error', e);
    return NextResponse.json({ error: 'portal failed' }, { status: 500 });
  }
}
