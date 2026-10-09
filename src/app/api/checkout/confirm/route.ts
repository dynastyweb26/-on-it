// POST /api/checkout/confirm — back from Stripe Checkout: record the
// subscription now instead of waiting for the webhook.
//
// The success URL carries ?session_id={CHECKOUT_SESSION_ID}; the returning
// screen posts that id here (lib/upgrade-return). The id is the ONLY input:
// the user comes from the session cookie, and everything about the payment
// (who it belongs to, whether it completed, the subscription's status) comes
// from Stripe. The write is the same one the webhook makes
// (lib/stripe/subscription-sync), founder rule included, and it is absolute,
// so a reload calling this again, or the webhook landing too, is harmless.
//
// Responses carry no Stripe detail:
//   401 not signed in · 429 rate limited · 400 malformed id
//   403 the session belongs to someone else · 404 no such session
//   409 not complete (or no subscription on it) · 503 billing not configured
//   500 Stripe or DB failure · 200 { ok: true } recorded
// Anything but 200 leaves the client polling /api/access for the webhook.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe/server';
import { applySubscription } from '@/lib/stripe/subscription-sync';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';

export const runtime = 'nodejs';

const Body = z.object({ sessionId: z.string().regex(/^cs_(test|live)_[A-Za-z0-9]{10,250}$/) });

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!(await rateLimit('checkout_confirm', rateIdentifier(req, user.id)))) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }

  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: 'invalid request' }, { status: 400 });

  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: 'billing_not_configured' }, { status: 503 });

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(body.data.sessionId);
  } catch (e) {
    if (e instanceof Stripe.errors.StripeInvalidRequestError && e.code === 'resource_missing') {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    console.error('checkout confirm: session lookup failed', (e as Error)?.message);
    return NextResponse.json({ error: 'confirm failed' }, { status: 500 });
  }

  // /api/checkout sets client_reference_id (and metadata.user_id) to the
  // user who started Checkout; a session id from anyone else is refused.
  const owner = session.client_reference_id ?? session.metadata?.user_id ?? null;
  if (owner !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  if (session.status !== 'complete' || !session.subscription) {
    return NextResponse.json({ error: 'not_complete' }, { status: 409 });
  }

  try {
    const sub = await stripe.subscriptions.retrieve(
      typeof session.subscription === 'string' ? session.subscription : session.subscription.id,
    );
    await applySubscription(sub, user.id);
  } catch (e) {
    const err = e as { code?: string; message?: string };
    console.error('checkout confirm: record failed', JSON.stringify({ code: err?.code, message: err?.message }));
    return NextResponse.json({ error: 'confirm failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
