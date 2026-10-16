// POST /api/subscription/offer — take the one retention offer (CANCEL-FLOW-
// SPEC.md §3, §4). Body: { kind: 'discount' | 'pause', months?: 1 | 2 | 3 }.
//   discount → STRIPE_RETENTION_COUPON_ID (50% off, repeating 2 months) or
//              STRIPE_RETENTION_COUPON_X3_ID (3 months) when 2 wouldn't cover
//              the next two renewals; added to the subscription's discounts
//   pause    → N months from the end of the paid period:
//              pause_collection { behavior: 'void', resumes_at } + metadata
//              onit_pause_from. Full access until the pause starts, then
//              the free tier until it clears (lib/subscription/state).
// No cancel happens. Eligibility is re-checked here against the LIVE Stripe
// subscription and the profile's retention_offer_used_at — never the client.
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { adminClient } from '@/lib/supabase/admin';
import { applySubscription } from '@/lib/subscription/sync';
import { isPauseMonths, OFFER_WINDOW_MS, offerAllowed, pauseResumesAt, pickRetentionCoupon, type OfferKind } from '@/lib/subscription/offers';
import { fail, logEvent, subscriptionContext } from '@/lib/subscription/route';
import { PAUSE_FROM_KEY, periodEndISO } from '@/lib/subscription/state';

export const runtime = 'nodejs';

const discountRef = (d: string | Stripe.Discount | Stripe.DeletedDiscount): string =>
  typeof d === 'string' ? d : d.id;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { kind?: unknown; months?: unknown };
  const kind: OfferKind | null = body?.kind === 'discount' || body?.kind === 'pause' ? body.kind : null;
  if (!kind) return fail(400, 'That offer isn’t available.', 'bad_request');
  if (kind === 'pause' && !isPauseMonths(body?.months)) return fail(400, 'Pick 1, 2 or 3 months.', 'bad_request');

  const coupons = {
    x2: process.env.STRIPE_RETENTION_COUPON_ID?.trim(),
    x3: process.env.STRIPE_RETENTION_COUPON_X3_ID?.trim(),
  };
  if (kind === 'discount' && (!coupons.x2 || !coupons.x3)) {
    return fail(503, 'That offer isn’t available right now.', 'offer_not_configured');
  }

  const ctx = await subscriptionContext(req);
  if (ctx instanceof NextResponse) return ctx;
  const { userId, stripe, profile, sub } = ctx;

  const now = new Date();
  const state = {
    status: sub.status,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    paused: Boolean(sub.pause_collection),
    retentionOfferUsedAt: profile.retention_offer_used_at,
  };
  if (!offerAllowed(kind, state, now)) {
    return fail(409, 'That offer isn’t available on your plan.', 'not_eligible');
  }

  let params: Stripe.SubscriptionUpdateParams;
  let resumesAt: Date | null = null;
  let pausedFrom: Date | null = null;
  if (kind === 'discount') {
    // 2- or 3-month coupon, whichever covers the next two renewals
    // (lib/subscription/offers: pickRetentionCoupon). Keep any discount
    // already on the subscription; add the retention coupon.
    const periodEnd = periodEndISO(sub);
    if (!periodEnd) return fail(409, 'That offer isn’t available on your plan.', 'not_eligible');
    const pick = pickRetentionCoupon({
      now, periodEnd: new Date(periodEnd), anchor: new Date(sub.billing_cycle_anchor * 1000),
    });
    const existing = (sub.discounts ?? []).map((d) => ({ discount: discountRef(d) }));
    params = { discounts: [...existing, { coupon: coupons[pick]! }] };
  } else {
    // The pause starts when the period already paid for ends (full access
    // until then) and lasts N months from there. pause_collection is set now
    // so that renewal's invoice is voided; the start is anchored in metadata
    // (lib/subscription/state: tierForSubscription).
    const periodEnd = periodEndISO(sub);
    if (!periodEnd) return fail(409, 'That offer isn’t available on your plan.', 'not_eligible');
    pausedFrom = new Date(periodEnd);
    resumesAt = pauseResumesAt(body.months as 1 | 2 | 3, pausedFrom);
    params = {
      pause_collection: { behavior: 'void', resumes_at: Math.floor(resumesAt.getTime() / 1000) },
      metadata: { [PAUSE_FROM_KEY]: String(Math.floor(pausedFrom.getTime() / 1000)) },
    };
  }

  // Claim the 12-month window BEFORE touching Stripe, atomically: the UPDATE
  // only matches while the window is still open, so two concurrent requests
  // can't both take an offer. Service role: the column is privileged.
  const admin = adminClient();
  const windowStart = new Date(now.getTime() - OFFER_WINDOW_MS).toISOString();
  const { data: claimed, error: claimErr } = await admin.from('profiles')
    .update({ retention_offer_used_at: now.toISOString() })
    .eq('id', userId)
    .or(`retention_offer_used_at.is.null,retention_offer_used_at.lt.${windowStart}`)
    .select('id');
  if (claimErr) {
    console.error('retention offer claim failed', claimErr.code ?? claimErr.message);
    return fail(500, 'Couldn’t apply that just now. Try again in a moment.');
  }
  if (!claimed?.length) return fail(409, 'That offer isn’t available on your plan.', 'not_eligible');

  let updated;
  try {
    updated = await stripe.subscriptions.update(sub.id, params);
  } catch (e) {
    console.error('subscription offer failed', kind, (e as Error)?.message);
    // Stripe didn't change: give the window back.
    const { error } = await admin.from('profiles')
      .update({ retention_offer_used_at: profile.retention_offer_used_at }).eq('id', userId);
    if (error) console.error('retention offer release failed', error.code ?? error.message);
    return fail(502, 'Couldn’t apply that just now. Try again in a moment.');
  }

  try { await applySubscription(updated, userId); } catch (e) {
    console.error('subscription offer: profile sync failed', (e as { code?: string })?.code);
  }
  await logEvent(userId, kind === 'discount'
    ? { kind: 'offer_discount', reason: 'price' }
    : { kind: 'offer_pause', reason: 'seasonal', months: body.months as number });

  return NextResponse.json({
    ok: true, kind,
    pausedFrom: pausedFrom?.toISOString() ?? null,
    pausedUntil: resumesAt?.toISOString() ?? null,
  });
}
