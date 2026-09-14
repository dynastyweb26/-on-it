// POST /api/checkout — Stripe hosted Checkout (mode: subscription, 30-day trial).
// User request (session client, NOT admin). Dormant without Stripe env: returns
// 503 with a clear message the paywall modal displays inline — never crashes.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe/server';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { calculateInvoiceTotals } from '@/lib/financials';

const CheckoutBody = z.object({
  invoice_id: z.string().uuid().optional(),
}).nullish();

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!(await rateLimit('checkout', rateIdentifier(req, user.id)))) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }

  const bodyParsed = CheckoutBody.safeParse(await req.json().catch(() => ({})));
  if (!bodyParsed.success) {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 });
  }
  const invoiceId = bodyParsed.data?.invoice_id;

  const stripe = getStripe();
  const price = process.env.STRIPE_PRICE_ID_MONTHLY;

  if (invoiceId) {
    if (!stripe) {
      return NextResponse.json(
        { error: 'billing_not_configured', message: 'Payments aren’t live yet — hang tight, we’ll let you know.' },
        { status: 503 }
      );
    }

    const { data: inv } = await supabase
      .from('invoices')
      .select('*, line_items')
      .eq('id', invoiceId)
      .maybeSingle();

    if (!inv) {
      return NextResponse.json({ error: 'invoice_not_found' }, { status: 404 });
    }

    const totals = calculateInvoiceTotals(
      inv.line_items ?? [],
      Number(inv.tax_rate ?? 0),
      inv.deposit_type,
      Number(inv.deposit_value ?? 0),
      Number(inv.amount_paid ?? 0)
    );

    if (totals.dueNow <= 0) {
      return NextResponse.json(
        { error: 'paid_in_full', message: 'This invoice is already paid in full.' },
        { status: 400 }
      );
    }

    const origin = req.nextUrl.origin;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `Payment for Invoice #${inv.invoice_number}` },
          unit_amount: Math.round(totals.dueNow * 100),
        },
        quantity: 1,
      }],
      client_reference_id: inv.id,
      metadata: { invoice_id: inv.id, user_id: inv.user_id },
      success_url: `${origin}/invoices/${inv.id}?paid=1`,
      cancel_url: `${origin}/invoices/${inv.id}`,
    });

    return NextResponse.json({ url: session.url, amount: totals.dueNow });
  }

  // Dormant path for subscriptions: billing not configured yet (no keys tonight).
  if (!stripe || !price) {
    return NextResponse.json(
      { error: 'billing_not_configured', message: 'Payments aren’t live yet — hang tight, we’ll let you know.' },
      { status: 503 }
    );
  }

  // Reuse an existing Stripe customer if the webhook already linked one.
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .maybeSingle();

  try {
    const origin = req.nextUrl.origin;
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      subscription_data: { trial_period_days: 30, metadata: { user_id: user.id } },
      // Existing customer, else let Checkout create one from the email; either
      // way the webhook stores the customer id back on the profile.
      ...(profile?.stripe_customer_id
        ? { customer: profile.stripe_customer_id }
        : { customer_email: user.email }),
      client_reference_id: user.id, // webhook maps the session back to the user
      metadata: { user_id: user.id },
      success_url: `${origin}/settings?upgraded=1`,
      cancel_url: `${origin}/chat`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error('checkout error', e);
    return NextResponse.json({ error: 'checkout failed' }, { status: 500 });
  }
}
