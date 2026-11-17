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
import { NEXT_PUBLIC_TIERS } from '@/lib/feature-flags';
import { aiLimitForUser } from '@/lib/ai-limit-usage';
import { aiLimitWindow } from '@/lib/ai-limit';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { trialEligible } from '@/lib/trial';
import { PLAN_CATALOG } from '@/lib/plan-catalog';
import { planCardFor } from '@/lib/plan-card';
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
  const [access, { data: profile }, { data: billing }] = await Promise.all([
    hasAccess(user.id, timing),
    step('trialProfile', supabase.from('profiles').select('trial_ends_at, subscription_status, timezone, current_period_end').eq('id', user.id).maybeSingle()),
    // The store-billing facts (RevenueCat, phase 5a). Its own query on purpose:
    // on a database before the migration these columns don't exist, this one
    // select fails alone, and all three read as null — nothing above changes.
    step('billing', supabase.from('profiles').select('billing_source, plan_change_to, plan_change_at').eq('id', user.id).maybeSingle()),
  ]);
  if (timing) {
    timing.hasAccessWall = Math.round(performance.now() - h0);
    timing.total = Math.round(performance.now() - t0);
    console.log('access-timing', JSON.stringify({ cold, ...timing }));
  }
  // Tiers (flag on only): the AI meter's numbers. Flag off → no count query
  // and no new keys, so the response is byte-for-byte today's. The plan facts
  // come from the entitlements hasAccess already resolved (a stored plan value
  // is not the answer here). A failed count reads as 0 used: a meter never
  // locks anyone out.
  const ai = NEXT_PUBLIC_TIERS
    ? await aiLimitForUser(supabase, user.id, {
      tier: access.tier,
      plan: access.entitlements.plan,
      timezone: profile?.timezone ?? null,
    })
    : null;

  // subscriptionsEnabled: is Stripe subscription checkout open in this
  // deployment? The paywall, Settings' Plan row and the upgrade nudges read it
  // here instead of a browser-side env read (the value is not NEXT_PUBLIC).
  const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);
  return NextResponse.json({
    ...access,
    trialEligible: trialEligible(profile),
    subscriptionsEnabled: subscriptionsEnabled(),
    // Additive: which system bills this profile ('stripe' | 'app_store' |
    // 'play_store' | null) and a scheduled store plan change, if any. Null on a
    // database without the RevenueCat migration, so the client shape is stable.
    billingSource: text(billing?.billing_source),
    planChangeTo: text(billing?.plan_change_to),
    planChangeAt: text(billing?.plan_change_at),
    ...(NEXT_PUBLIC_TIERS
      ? {
        aiUsedToday: ai?.used ?? 0,
        aiLimit: ai?.limit ?? access.entitlements.aiDailyLimit,
        aiResetsAt: ai?.resetsAt ?? aiLimitWindow(profile?.timezone ?? null, new Date()).resetsAt,
        // The plan screens' one source: display names, prices, trial length and
        // the Free / Pro / Plus comparison rows (lib/plan-catalog).
        planCatalog: PLAN_CATALOG,
        // Settings > Plan as data (design/tiers 06): the plan, its catalog
        // price, the renewal or trial end, a pending change, who bills it and
        // the founder case — decided in lib/plan-card, so the card renders and
        // computes nothing.
        planCard: planCardFor({
          tier: access.tier,
          plan: access.entitlements.plan,
          billingSource: text(billing?.billing_source),
          trialEndsAt: profile?.trial_ends_at ?? null,
          currentPeriodEnd: profile?.current_period_end ?? null,
          planChangeTo: text(billing?.plan_change_to),
          planChangeAt: text(billing?.plan_change_at),
        }),
      }
      : {}),
  });
}
