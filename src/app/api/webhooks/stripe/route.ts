// POST /api/webhooks/stripe — subscription lifecycle → profiles access.
// Server-to-server (no user session) → the service-role admin client is the
// legitimate, audited use here. Outside middleware (matcher excludes /api/).
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

export const runtime = 'nodejs';

// Stripe's tier vocabulary → our access_tier. Anything not a live/at-risk
// status collapses to 'canceled' (no access).
function tierFromStatus(status: Stripe.Subscription.Status): 'trialing' | 'active' | 'past_due' | 'canceled' {
  if (status === 'trialing') return 'trialing';
  if (status === 'active') return 'active';
  if (status === 'past_due') return 'past_due';
  return 'canceled'; // canceled, unpaid, incomplete, incomplete_expired, paused
}

// current_period_end lives on the subscription in classic API versions and on
// the subscription item in newer ones — read whichever exists.
function periodEndISO(sub: Stripe.Subscription): string | null {
  const raw =
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    sub.items?.data?.[0]?.current_period_end;
  return raw ? new Date(raw * 1000).toISOString() : null;
}

// Throws on DB failure so the caller returns 500 and Stripe retries.
async function applySubscription(sub: Stripe.Subscription, explicitUserId?: string) {
  const supabase = adminClient();
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

  // Resolve the profile: explicit user id (checkout) or by customer id (updates).
  let id = explicitUserId ?? sub.metadata?.user_id;
  if (!id) {
    const { data, error } = await supabase
      .from('profiles').select('id').eq('stripe_customer_id', customerId).maybeSingle();
    if (error) throw error;
    id = data?.id;
  }
  if (!id) { console.warn('stripe webhook: no profile for customer', customerId); return; }

  // Never downgrade a founder — grants outrank subscriptions.
  const { data: profile, error: readErr } = await supabase
    .from('profiles').select('access_tier').eq('id', id).maybeSingle();
  if (readErr) throw readErr;
  const founder = profile?.access_tier === 'founder';

  const { error: updErr } = await supabase.from('profiles').update({
    stripe_customer_id: customerId,
    subscription_status: sub.status,
    current_period_end: periodEndISO(sub),
    trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    ...(founder ? {} : { access_tier: tierFromStatus(sub.status) }),
  }).eq('id', id);
  if (updErr) throw updErr;
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
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
        await applySubscription(event.data.object as Stripe.Subscription);
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
            .from('profiles').select('id, access_tier').eq('stripe_customer_id', customerId).maybeSingle();
          if (error) throw error;
          id = data?.id;
          if (data?.access_tier === 'founder') break; // never downgrade a founder
        }
        if (id) {
          const { data: p } = await supabase.from('profiles').select('access_tier').eq('id', id).maybeSingle();
          if (p?.access_tier === 'founder') break;
          const { error } = await supabase.from('profiles').update({
            access_tier: 'canceled',
            subscription_status: sub.status,
            current_period_end: periodEndISO(sub),
          }).eq('id', id);
          if (error) throw error;
        }
        break;
      }
      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice;
        const customerId = typeof inv.customer === 'string' ? inv.customer : inv.customer?.id;
        if (customerId) {
          const supabase = adminClient();
          const { data: prof, error: readErr } = await supabase
            .from('profiles').select('id, access_tier').eq('stripe_customer_id', customerId).maybeSingle();
          if (readErr) throw readErr;
          if (prof?.id && prof.access_tier !== 'founder') {
            const { error } = await supabase
              .from('profiles').update({ access_tier: 'past_due' }).eq('id', prof.id);
            if (error) throw error;
          }
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
