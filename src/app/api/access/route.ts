// GET /api/access — the client's read-only window into hasAccess().
// The chat paywall gate fetches this before creating an invoice; the access
// logic itself is server-only (RLS-scoped DB reads).
//
// Preview only: one "access-timing" log line per request with each step's
// duration, the wall time, and whether this instance was cold, so the
// request can be measured from `vercel logs`. Production logs nothing extra.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { hasAccess, type AccessTiming } from '@/lib/access';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { trialEligible } from '@/lib/trial';
import { subscriptionsEnabled } from '@/lib/subscriptions';

const MEASURE = process.env.VERCEL_ENV === 'preview';
let warm = false; // per function instance: false on its first request

export async function GET(req: NextRequest) {
  const t0 = performance.now();
  const timing: AccessTiming | undefined = MEASURE ? {} : undefined;
  const cold = !warm;
  warm = true;
  const step = async <T,>(key: string, p: PromiseLike<T>): Promise<T> => {
    const s = performance.now();
    try { return await p; } finally { if (timing) timing[key] = Math.round(performance.now() - s); }
  };

  const supabase = await createClient();
  const { data: { user } } = await step('getUser', supabase.auth.getUser());
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Rate-limit access checks to prevent excessive polling and database query spam.
  if (!(await step('rateLimit', rateLimit('access', rateIdentifier(req, user.id))))) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }

  // trialEligible drives the disclosure copy ("14-day free trial, then …" vs
  // "$9.99/month, recurring"). The same rule as /api/checkout's first check;
  // checkout also asks Stripe, and Stripe's Checkout page shows the final terms.
  const h0 = performance.now();
  const [access, { data: profile }] = await Promise.all([
    hasAccess(user.id, timing),
    step('trialProfile', supabase.from('profiles').select('trial_ends_at, subscription_status').eq('id', user.id).maybeSingle()),
  ]);
  if (timing) {
    timing.hasAccessWall = Math.round(performance.now() - h0);
    timing.total = Math.round(performance.now() - t0);
    console.log('access-timing', JSON.stringify({ cold, ...timing }));
  }
  // subscriptionsEnabled: is Stripe subscription checkout open in this
  // deployment? The paywall, Settings' Plan row and the upgrade nudges read it
  // here instead of a browser-side env read (the value is not NEXT_PUBLIC).
  return NextResponse.json({
    ...access,
    trialEligible: trialEligible(profile),
    subscriptionsEnabled: subscriptionsEnabled(),
  });
}
