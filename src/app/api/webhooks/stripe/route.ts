// POST /api/webhooks/stripe — subscription lifecycle → profiles access.
// Server-to-server (no user session) → the service-role admin client is the
// legitimate, audited use here. No user session is involved.
//
// runtime = 'nodejs': signature verification needs the RAW body (req.text(),
// byte-for-byte — never req.json(), never zod) and node crypto.
//
// Error contract (locked):
//   missing/invalid signature      → 400
//   unrecognized/uninteresting evt → 200 (log + skip)
//   handler DB failure / exception → 500 (Stripe retries with backoff)
//   handled successfully           → 200
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe/server';
import { adminClient } from '@/lib/supabase/admin';
import { applySubscription, periodEndISO, setTierUnlessFounder } from '@/lib/stripe/subscription-sync';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  // Trimmed: stray whitespace from a pasted env value would fail every signature check.
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  // Dormant path: no keys tonight. Return 503 cleanly, never throw.
  if (!stripe || !secret) {
    return NextResponse.json({ error: 'billing_not_configured' }, { status: 503 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'missing signature' }, { status: 400 });

  // RAW body — required for signature verification.
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await req.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
  }

  console.log('stripe webhook:', event.type); // observability

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id ?? session.client_reference_id ?? undefined;
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
        // Link the customer id immediately even before the subscription events land.
        if (userId && customerId) {
          const supabase = adminClient();
          const { error } = await supabase
            .from('profiles').update({ stripe_customer_id: customerId }).eq('id', userId);
          if (error) throw error;
        }
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(
            typeof session.subscription === 'string' ? session.subscription : session.subscription.id
          );
          await applySubscription(sub, userId);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        // Fetch the subscription fresh rather than trusting the event's
        // snapshot: Stripe doesn't guarantee delivery order, so a late,
        // older event could otherwise roll a paid user back (e.g. an
        // 'incomplete' snapshot landing after the 'active' one).
        const snapshot = event.data.object as Stripe.Subscription;
        const sub = await stripe.subscriptions.retrieve(snapshot.id);
        await applySubscription(sub);
        break;
      }
      case 'customer.subscription.deleted': {
        // Explicit terminal state regardless of the reported status.
        const sub = event.data.object as Stripe.Subscription;
        const supabase = adminClient();
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
        let id = sub.metadata?.user_id;
        if (!id) {
          const { data, error } = await supabase
            .from('profiles').select('id').eq('stripe_customer_id', customerId).maybeSingle();
          if (error) throw error;
          id = data?.id;
        }
        if (id) {
          // Billing facts for everyone; the tier only for non-founders (atomic).
          const { error } = await supabase.from('profiles').update({
            subscription_status: sub.status,
            current_period_end: periodEndISO(sub),
          }).eq('id', id);
          if (error) throw error;
          await setTierUnlessFounder(supabase, { id }, 'canceled');
        }
        break;
      }
      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice;
        const customerId = typeof inv.customer === 'string' ? inv.customer : inv.customer?.id;
        if (customerId) {
          await setTierUnlessFounder(adminClient(), { stripe_customer_id: customerId }, 'past_due');
        }
        break;
      }
      default:
        // Acknowledged, not processed — Stripe won't retry a 200.
        return NextResponse.json({ received: true, ignored: event.type });
    }
    return NextResponse.json({ received: true });
  } catch (e) {
    // Transient DB/Stripe failure → 500 so Stripe retries with backoff.
    // Serialize the error so the code (e.g. PostgREST PGRST204 "column not
    // found") is captured in full instead of a truncated object.
    const err = e as { code?: string; message?: string; details?: string; hint?: string };
    console.error('stripe webhook handler error', event.type, JSON.stringify({
      code: err?.code, message: err?.message, details: err?.details, hint: err?.hint,
    }));
    return NextResponse.json({ error: 'handler failed' }, { status: 500 });
  }
}
