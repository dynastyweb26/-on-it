// POST /api/subscription/offer — take the one retention offer (CANCEL-FLOW-
// SPEC.md §3, §4; TIERS-SPEC's two-plan cancel table). Body:
//   { kind: 'discount' | 'pause', months?: 1 | 2 | 3 }
//   { kind: 'switch_pro' }            ← NEXT_PUBLIC_TIERS only
//   discount    → STRIPE_RETENTION_COUPON_ID (50% off, repeating 2 months) or
//                 STRIPE_RETENTION_COUPON_X3_ID (3 months) when 2 wouldn't
//                 cover the next two renewals; added to the subscription's
//                 discounts
//   pause       → N months from the end of the paid period:
//                 pause_collection { behavior: 'void', resumes_at } + metadata
//                 onit_pause_from. Full access until the pause starts, then
//                 the free tier until it clears (lib/subscription/state).
//   switch_pro  → Plus → Pro at the end of the paid period (TIERS-SPEC:
//                 "switching to Pro from the cancel screen is a downgrade and
//                 counts as the offer taken"). This route RECORDS the offer —
//                 the same atomic claim plus an offer_switch_pro event — and
//                 nothing else: no charge, no Stripe change.
//                 It does NOT use the Stripe context: Plus is store-only, so a
//                 Plus profile has no Stripe customer and no Stripe
//                 subscription (requiring one made this impossible to take).
//                 subscriptionContext stays the path for discount and pause.
// No cancel happens. Eligibility is re-checked here against the live state —
// the Stripe subscription for discount/pause, the profile the RevenueCat
// webhook writes for the Pro switch — never the client.
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { adminClient } from '@/lib/supabase/admin';
import { NEXT_PUBLIC_TIERS } from '@/lib/feature-flags';
import { applySubscription } from '@/lib/subscription/sync';
import { isPauseMonths, OFFER_WINDOW_MS, offerAllowed, pauseResumesAt, pickRetentionCoupon, type CancelOffer } from '@/lib/subscription/offers';
import { takeSwitchProOffer } from '@/lib/subscription/switch-offer';
import { fail, logEvent, storeOfferContext, subscriptionContext } from '@/lib/subscription/route';
import { PAUSE_FROM_KEY, periodEndISO } from '@/lib/subscription/state';

export const runtime = 'nodejs';

const discountRef = (d: string | Stripe.Discount | Stripe.DeletedDiscount): string =>
  typeof d === 'string' ? d : d.id;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { kind?: unknown; months?: unknown };
  // 'switch_pro' exists only with the tiers flag on. Off, it is the unknown
  // kind it is today and the answer is exactly today's.
  const kind: CancelOffer | null =
    body?.kind === 'discount' || body?.kind === 'pause'
      ? body.kind
      : NEXT_PUBLIC_TIERS && body?.kind === 'switch_pro'
        ? 'switch_pro'
        : null;
  if (!kind) return fail(400, 'That offer isn’t available.', 'bad_request');
  if (kind === 'pause' && !isPauseMonths(body?.months)) return fail(400, 'Pick 1, 2 or 3 months.', 'bad_request');

  const coupons = {
    x2: process.env.STRIPE_RETENTION_COUPON_ID?.trim(),
    x3: process.env.STRIPE_RETENTION_COUPON_X3_ID?.trim(),
  };
  if (kind === 'discount' && (!coupons.x2 || !coupons.x3)) {
    return fail(503, 'That offer isn’t available right now.', 'offer_not_configured');
  }

  // ── The Pro switch: profile only, no Stripe subscription ────────
  if (kind === 'switch_pro') {
    const ctx = await storeOfferContext(req);
    if (ctx instanceof NextResponse) return ctx;
    const admin = adminClient();

    const result = await takeSwitchProOffer({
      tiersOn: NEXT_PUBLIC_TIERS,
      profile: ctx.profile,
      now: new Date(),
      // The same atomic 12-month claim every offer uses (the column is
      // privileged: the service role writes it).
      claimWindow: async (now) => {
        const windowStart = new Date(now.getTime() - OFFER_WINDOW_MS).toISOString();
        const { data: claimed, error } = await admin.from('profiles')
          .update({ retention_offer_used_at: now.toISOString() })
          .eq('id', ctx.userId)
          .or(`retention_offer_used_at.is.null,retention_offer_used_at.lt.${windowStart}`)
          .select('id');
        if (error) {
          console.error('retention offer claim failed', error.code ?? error.message);
          return 'error';
        }
        return claimed?.length ? 'claimed' : 'not_eligible';
      },
      // Then the record of the offer taken. Switching counts as the offer.
      logOffer: async () => {
        await logEvent(ctx.userId, { kind: 'offer_switch_pro', reason: 'price' });
      },
    });

    if (!result.ok) {
      const message = result.error === 'bad_request'
        ? 'That offer isn’t available.'
        : result.error === 'not_eligible'
          ? 'That offer isn’t available on your plan.'
          : 'Couldn’t apply that just now. Try again in a moment.';
      return fail(result.status, message, result.error);
    }

    return NextResponse.json({ ok: true, kind, pausedFrom: null, pausedUntil: null });
  }

  // ── Discount and pause: today's Stripe path, unchanged ──────────
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

  let updated: Stripe.Subscription;
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
