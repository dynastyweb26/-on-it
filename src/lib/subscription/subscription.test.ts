import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accessEndsISO, PAUSE_FROM_KEY, pauseStartsAt, planFromTier, profileFieldsFor, tierForSubscription, tierFromStatus } from './state';
import { addMonthsClamped, canPause, cancelOffersFor, nextRenewal, offerAllowed, offerEligible, offerFor, OFFER_WINDOW_MS, pauseResumesAt, pickRetentionCoupon, type OfferState } from './offers';
import { averageDaysToPaid, statTiles } from './stats';
import { cleanDetail, isCancelReason } from './reasons';
import { discountLine, endsWithPlanLine, freePlanAfterLine, offerNotice, pausedLine, pauseOfferLine } from './copy';
import { cancellationEmail } from '../email/cancellation';
import { readFileSync } from 'node:fs';

const NOW = new Date('2026-10-16T12:00:00Z');
const T = (iso: string) => Math.floor(Date.parse(iso) / 1000);

// ── Tiers ─────────────────────────────────────────────────────────

test('tier: status mapping (paused / unpaid / incomplete collapse to canceled)', () => {
  assert.equal(tierFromStatus('trialing'), 'trialing');
  assert.equal(tierFromStatus('active'), 'active');
  assert.equal(tierFromStatus('past_due'), 'past_due');
  for (const s of ['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused']) {
    assert.equal(tierFromStatus(s), 'canceled', s);
  }
});

test('plan: trialing and active are pro, past_due and canceled leave it alone', () => {
  assert.equal(planFromTier('trialing'), 'pro');
  assert.equal(planFromTier('active'), 'pro');
  // Null = no write: a lapsed or paused subscription keeps the plan value it
  // had, so a resubscribe restores it; access_tier already decides access.
  assert.equal(planFromTier('past_due'), null);
  assert.equal(planFromTier('canceled'), null);
});

test('sync: the plan write rides the same atomic founder guard', () => {
  const src = readFileSync(new URL('./sync.ts', import.meta.url), 'utf8');
  // Only trialing / active set a plan, and a founder is never overwritten: the
  // tier and plan writes pass guardFounder=true, which lib/billing-write.ts
  // applies inside the same UPDATE as the source rule.
  assert.match(src, /planFromTier\(tier\)/);
  assert.match(src, /writeStripe\(supabase, match, \{ access_tier: tier \}, true\)/);
  assert.match(src, /writeStripe\(supabase, match, \{ plan \}, true\)/);
  assert.match(readFileSync(new URL('../billing-write.ts', import.meta.url), 'utf8'),
    /access_tier\.is\.null,access_tier\.neq\.founder/);
});

test('tier: pause set outside the app (no anchor) is the free tier at once', () => {
  assert.equal(tierForSubscription({ status: 'active', pause_collection: { resumes_at: T('2026-12-16T12:00:00Z') } }, NOW), 'canceled');
  assert.equal(tierForSubscription({ status: 'active', pause_collection: null }, NOW), 'active');
  // Cleared pause → the status mapping takes over again.
  assert.equal(tierForSubscription({ status: 'active' }, NOW), 'active');
});

// In-app pause taken Oct 16 on a period ending Nov 16, for 2 months.
const PAUSED = {
  status: 'active',
  pause_collection: { resumes_at: T('2027-01-16T12:00:00Z') },
  metadata: { [PAUSE_FROM_KEY]: String(T('2026-11-16T12:00:00Z')) },
  items: { data: [{ current_period_end: T('2026-11-16T12:00:00Z') }] },
};

test('pause: before the paid period ends → full access (status mapping)', () => {
  assert.equal(tierForSubscription(PAUSED, NOW), 'active');
  assert.equal(tierForSubscription(PAUSED, new Date('2026-11-16T11:59:59Z')), 'active');
});

test('pause: from the period end → free tier, even after the renewal moved the period forward', () => {
  assert.equal(tierForSubscription(PAUSED, new Date('2026-11-16T12:00:00Z')), 'canceled');
  // The voided renewal advances current_period_end to Dec 16; the anchor
  // (metadata), not the period end, decides.
  const rolled = { ...PAUSED, items: { data: [{ current_period_end: T('2026-12-16T12:00:00Z') }] } };
  assert.equal(tierForSubscription(rolled, new Date('2026-11-16T12:05:00Z')), 'canceled');
  assert.equal(tierForSubscription(rolled, new Date('2027-01-10T00:00:00Z')), 'canceled');
});

test('pause: test clock — renewal event in real time still flips the tier (clock C)', () => {
  // Clock C's Nov 17 renewal event, processed on Oct 16 real time: the new
  // period started Nov 17 (clock time), which is the pause anchor.
  const renewed = { ...PAUSED, items: { data: [{ current_period_start: T('2026-11-16T12:00:00Z'), current_period_end: T('2026-12-16T12:00:00Z') }] } };
  assert.equal(tierForSubscription(renewed, NOW), 'canceled');
  // Before the renewal (period still Oct 16 → Nov 16) it stays paid.
  const before = { ...PAUSED, items: { data: [{ current_period_start: T('2026-10-16T12:00:00Z'), current_period_end: T('2026-11-16T12:00:00Z') }] } };
  assert.equal(tierForSubscription(before, NOW), 'active');
});

test('pause: cleared → full access again; bad anchor → treated as no anchor', () => {
  assert.equal(tierForSubscription({ ...PAUSED, pause_collection: null }, new Date('2026-12-01T00:00:00Z')), 'active');
  assert.equal(pauseStartsAt({ status: 'active', metadata: { [PAUSE_FROM_KEY]: '' } }), null);
  assert.equal(pauseStartsAt({ status: 'active', metadata: { [PAUSE_FROM_KEY]: 'x' } }), null);
});

test('tier: cancel_at_period_end keeps access until the period ends', () => {
  assert.equal(tierForSubscription({ status: 'active', cancel_at_period_end: true }), 'active');
  assert.equal(tierForSubscription({ status: 'trialing', cancel_at_period_end: true }), 'trialing');
});

test('profile fields: cancel flag, paused_until, item-level period end', () => {
  const f = profileFieldsFor({
    status: 'active',
    cancel_at_period_end: true,
    pause_collection: { resumes_at: T('2027-01-16T12:00:00Z') },
    items: { data: [{ current_period_end: T('2026-11-16T12:00:00Z') }] },
  });
  assert.equal(f.cancel_at_period_end, true);
  assert.equal(f.paused_until, '2027-01-16T12:00:00.000Z');
  assert.equal(f.current_period_end, '2026-11-16T12:00:00.000Z');
  assert.equal(f.trial_ends_at, null);
  const plain = profileFieldsFor({ status: 'active' });
  assert.equal(plain.cancel_at_period_end, false);
  assert.equal(plain.paused_until, null);
});

test('access ends: trial end while trialing, else period end', () => {
  assert.equal(accessEndsISO({ status: 'trialing', trial_end: T('2026-10-30T00:00:00Z'), current_period_end: T('2026-10-30T00:00:00Z') }), '2026-10-30T00:00:00.000Z');
  assert.equal(accessEndsISO({ status: 'active', trial_end: T('2026-09-01T00:00:00Z'), current_period_end: T('2026-11-16T00:00:00Z') }), '2026-11-16T00:00:00.000Z');
});

// ── Offer eligibility ─────────────────────────────────────────────

const base: OfferState = { status: 'active', cancelAtPeriodEnd: false, paused: false, retentionOfferUsedAt: null };

test('eligibility: active and trialing yes; past_due and others no', () => {
  assert.equal(offerEligible(base, NOW), true);
  assert.equal(offerEligible({ ...base, status: 'trialing' }, NOW), true);
  assert.equal(offerEligible({ ...base, status: 'past_due' }, NOW), false);
  assert.equal(offerEligible({ ...base, status: 'canceled' }, NOW), false);
});

test('eligibility: not while canceling or paused', () => {
  assert.equal(offerEligible({ ...base, cancelAtPeriodEnd: true }, NOW), false);
  assert.equal(offerEligible({ ...base, paused: true }, NOW), false);
});

test('eligibility: one offer per 12 months', () => {
  const inside = new Date(NOW.getTime() - OFFER_WINDOW_MS + 60_000).toISOString();
  const outside = new Date(NOW.getTime() - OFFER_WINDOW_MS - 60_000).toISOString();
  assert.equal(offerEligible({ ...base, retentionOfferUsedAt: inside }, NOW), false);
  assert.equal(offerEligible({ ...base, retentionOfferUsedAt: outside }, NOW), true);
});

test('offer per reason: price → discount, seasonal → pause, others none', () => {
  assert.equal(offerFor('price', 'active', true), 'discount');
  assert.equal(offerFor('seasonal', 'active', true), 'pause');
  for (const r of ['feature', 'switching', 'other'] as const) assert.equal(offerFor(r, 'active', true), null);
  assert.equal(offerFor(null, 'active', true), null);
});

test('offer per reason: trial gets the discount but never a pause', () => {
  assert.equal(offerFor('price', 'trialing', true), 'discount');
  assert.equal(offerFor('seasonal', 'trialing', true), null);
});

test('offer per reason: not eligible → no offer card at all', () => {
  assert.equal(offerFor('price', 'active', false), null);
  assert.equal(offerFor('seasonal', 'active', false), null);
});

test('route check: offerAllowed mirrors the screen', () => {
  assert.equal(offerAllowed('discount', base, NOW), true);
  assert.equal(offerAllowed('pause', base, NOW), true);
  assert.equal(offerAllowed('pause', { ...base, status: 'trialing' }, NOW), false);
  assert.equal(offerAllowed('discount', { ...base, status: 'past_due' }, NOW), false);
  assert.equal(offerAllowed('discount', { ...base, retentionOfferUsedAt: NOW.toISOString() }, NOW), false);
});

test('pause end: N calendar months, clamped to month end', () => {
  assert.equal(pauseResumesAt(2, NOW).toISOString(), '2026-12-16T12:00:00.000Z');
  assert.equal(pauseResumesAt(1, new Date('2027-01-31T09:00:00Z')).toISOString(), '2027-02-28T09:00:00.000Z');
  assert.equal(pauseResumesAt(3, new Date('2026-11-30T09:00:00Z')).toISOString(), '2027-02-28T09:00:00.000Z');
});

// ── Stats thresholds ──────────────────────────────────────────────

const rich = { invoicesSent: 12, collected: 4250.5, daysToPaid: [2, 4, 6], clientsSaved: 5 };

test('stats: fewer than 3 sent invoices hides the panel', () => {
  assert.deepEqual(statTiles({ ...rich, invoicesSent: 2 }), []);
  assert.equal(statTiles({ ...rich, invoicesSent: 3 }).length, 4);
});

test('stats: all four tiles, in order', () => {
  assert.deepEqual(statTiles(rich).map((t) => t.key), ['sent', 'collected', 'daysToPaid', 'clients']);
  assert.equal(statTiles(rich).find((t) => t.key === 'daysToPaid')?.value, 4);
});

test('stats: a zero tile is dropped, not shown as 0', () => {
  const tiles = statTiles({ ...rich, collected: 0, clientsSaved: 0 });
  assert.deepEqual(tiles.map((t) => t.key), ['sent', 'daysToPaid']);
});

test('stats: average days needs 3 paid invoices', () => {
  assert.equal(averageDaysToPaid([1, 2]), null);
  assert.equal(averageDaysToPaid([1, 2, 4]), 2.3);
  assert.equal(averageDaysToPaid([1, 2, -5]), null); // negative spans ignored
  assert.deepEqual(statTiles({ ...rich, daysToPaid: [1] }).map((t) => t.key), ['sent', 'collected', 'clients']);
});

test('stats: fewer than 2 surviving tiles hides the panel', () => {
  assert.deepEqual(statTiles({ invoicesSent: 5, collected: 0, daysToPaid: [], clientsSaved: 0 }), []);
});

// ── Reasons + copy ────────────────────────────────────────────────

test('reasons: keys and detail cleaning', () => {
  assert.equal(isCancelReason('price'), true);
  assert.equal(isCancelReason('bogus'), false);
  assert.equal(cleanDetail('switching', 'kept?'), null); // no field for this reason
  assert.equal(cleanDetail('feature', '  needs\n\tmileage  '), 'needs mileage');
  assert.equal(cleanDetail('other', '   '), null);
  assert.equal(cleanDetail('feature', 'x'.repeat(900))?.length, 500);
  // Security: Unicode NFKC normalization, strip format controls (\p{Cf}), control chars
  assert.equal(cleanDetail('feature', 'needs\u200B \uFEFFmileage\u3000tracking'), 'needs mileage tracking');
  assert.equal(cleanDetail('other', '\u200B\uFEFF   '), null);
});

test('copy: free plan line uses the real limits, never "a month"', () => {
  assert.equal(freePlanAfterLine({ invoices: 3, expenses: 5 }), 'after that you’re on the free plan (3 invoices and 5 expenses).');
  assert.equal(freePlanAfterLine({ invoices: null, expenses: null }), 'after that you’re on the free plan.');
  assert.ok(!/month/.test(freePlanAfterLine({ invoices: 3, expenses: 5 })));
});

test('copy: ends-with-plan line matches what the paywall gates', () => {
  assert.match(endsWithPlanLine(false), /invoices and expenses, and PDF reports/);
  assert.match(endsWithPlanLine(true), /recaps/);
  assert.equal(offerNotice('discount'), 'Done. Half price for your next 2 months.');
  assert.equal(offerNotice('paused'), 'Done. Your pause is set.');
});

test('copy: discount never hard-codes the discounted price', () => {
  for (const t of [true, false]) {
    assert.match(discountLine(t), /half price/i);
    assert.ok(!/\$4\.99|\$5\.00/.test(discountLine(t)));
  }
});

test('copy: pause lines name both dates before it starts, resume date after', () => {
  const from = '2026-11-16T12:00:00Z';
  const until = '2027-01-16T12:00:00Z';
  assert.equal(pausedLine(from, until, false), 'Paused from Nov 16, 2026 until Jan 16, 2027. You keep full access until Nov 16, 2026.');
  assert.equal(pausedLine(from, until, true), 'Paused until Jan 16, 2027. Your plan picks back up then.');
  assert.equal(pauseOfferLine(from, until), 'No charges while paused. You keep full access until Nov 16, 2026, then your plan picks back up Jan 16, 2027.');
  // The route's dates: N months from the period end.
  assert.equal(pauseResumesAt(2, new Date(from)).toISOString(), '2027-01-16T12:00:00.000Z');
});

test('email: honest, no emoji, escapes the business name', () => {
  const e = cancellationEmail({ businessName: 'A&B <Roofing>', endsOn: 'Nov 16, 2026', freePlan: 'the free plan (3 invoices and 5 expenses)', manageUrl: 'https://x/settings/plan' });
  assert.equal(e.subject, 'Your On It plan ends Nov 16, 2026');
  assert.match(e.text, /nothing is deleted/);
  assert.match(e.html, /A&amp;B &lt;Roofing&gt;/);
  assert.ok(!/\p{Extended_Pictographic}/u.test(e.text + e.html));
  assert.ok(!/miss you|leaving us/i.test(e.text));
});

// ── Retention coupon choice (x2 / x3) ─────────────────────────────

const D = (iso: string) => new Date(iso);
const pick = (now: string, periodEnd: string, anchor: string) =>
  pickRetentionCoupon({ now: D(now), periodEnd: D(periodEnd), anchor: D(anchor) });

test('calendar: clamping matches Stripe (end and renewals)', () => {
  assert.equal(addMonthsClamped(D('2026-10-17T00:00:00Z'), 2).toISOString(), '2026-12-17T00:00:00.000Z'); // clock A discount end
  assert.equal(addMonthsClamped(D('2027-12-31T05:00:00Z'), 2).toISOString(), '2028-02-29T05:00:00.000Z');
  // Anchor on the 31st: Jan 31 → Feb 28 → Mar 31 (back to the anchor day).
  assert.equal(nextRenewal(D('2027-01-31T00:00:00Z'), D('2026-10-31T00:00:00Z')).toISOString(), '2027-02-28T00:00:00.000Z');
  assert.equal(nextRenewal(D('2027-02-28T00:00:00Z'), D('2026-10-31T00:00:00Z')).toISOString(), '2027-03-31T00:00:00.000Z');
});

test('coupon: applied exactly at the renewal (clock A) → x3', () => {
  // Second renewal Dec 17 00:00 == the 2-month end.
  assert.equal(pick('2026-10-17T00:00:00Z', '2026-11-17T00:00:00Z', '2026-10-17T00:00:00Z'), 'x3');
});

test('coupon: right after a renewal → x3', () => {
  assert.equal(pick('2026-11-17T01:00:00Z', '2026-12-17T00:00:00Z', '2026-10-17T00:00:00Z'), 'x3');
});

test('coupon: mid-period → x2', () => {
  assert.equal(pick('2026-11-01T00:00:00Z', '2026-11-17T00:00:00Z', '2026-10-17T00:00:00Z'), 'x2');
});

test('coupon: 24h margin boundary', () => {
  // 2-month end Dec 18 00:00 vs second renewal Dec 17 00:00: exactly 24h → x3, a second more → x2.
  assert.equal(pick('2026-10-18T00:00:00Z', '2026-11-17T00:00:00Z', '2026-10-17T00:00:00Z'), 'x3');
  assert.equal(pick('2026-10-18T00:00:01Z', '2026-11-17T00:00:00Z', '2026-10-17T00:00:00Z'), 'x2');
});

test('coupon: anchor on the 31st, incl. February', () => {
  const a = '2026-10-31T00:00:00Z';
  // Right after the clamped Feb 28 renewal: next are Mar 31 and Apr 30; x2 ends Apr 28.
  assert.equal(pick('2027-02-28T01:00:00Z', '2027-03-31T00:00:00Z', a), 'x3');
  // Right after Mar 31: next are Apr 30 and May 31; x2 ends May 31 01:00.
  assert.equal(pick('2027-03-31T01:00:00Z', '2027-04-30T00:00:00Z', a), 'x3');
  // Right after Jan 31: next are Feb 28 and Mar 31; x2 ends Mar 31 01:00.
  assert.equal(pick('2027-01-31T01:00:00Z', '2027-02-28T00:00:00Z', a), 'x3');
  // Mid-period.
  assert.equal(pick('2027-03-15T00:00:00Z', '2027-03-31T00:00:00Z', a), 'x2');
  assert.equal(pick('2027-02-10T00:00:00Z', '2027-02-28T00:00:00Z', a), 'x2');
});

test('coupon: anchor on the 30th, incl. February', () => {
  const a = '2026-10-30T00:00:00Z';
  assert.equal(pick('2027-02-28T01:00:00Z', '2027-03-30T00:00:00Z', a), 'x3'); // next Mar 30, Apr 30; x2 ends Apr 28
  assert.equal(pick('2027-03-10T00:00:00Z', '2027-03-30T00:00:00Z', a), 'x2');
  assert.equal(pick('2027-02-10T00:00:00Z', '2027-02-28T00:00:00Z', a), 'x2'); // next Feb 28, Mar 30; x2 ends Apr 10
});

test('coupon: anchor on the 29th, leap and non-leap February', () => {
  const a = '2026-10-29T00:00:00Z';
  assert.equal(pick('2027-02-28T01:00:00Z', '2027-03-29T00:00:00Z', a), 'x3'); // non-leap: next Mar 29, Apr 29; x2 ends Apr 28
  assert.equal(pick('2028-02-29T01:00:00Z', '2028-03-29T00:00:00Z', a), 'x3'); // leap: next Mar 29, Apr 29; x2 ends Apr 29 01:00
  assert.equal(pick('2027-03-05T00:00:00Z', '2027-03-29T00:00:00Z', a), 'x2');
});

test('coupon: trial (anchor = trial end) mid-trial → x2', () => {
  assert.equal(pick('2026-10-16T12:00:00Z', '2026-10-30T12:00:00Z', '2026-10-30T12:00:00Z'), 'x2');
});

// ── Cancel offers, two plans (TIERS-SPEC table) ────────────────────

const PRO = { plan: 'pro', trialing: false, billingSource: 'stripe', eligible: true } as const;
const PLUS = { plan: 'plus', trialing: false, billingSource: 'stripe', eligible: true } as const;

test('cancel offers: Pro keeps today’s table exactly', () => {
  assert.deepEqual(cancelOffersFor({ ...PRO, reason: 'price' }), ['discount']);
  assert.deepEqual(cancelOffersFor({ ...PRO, reason: 'seasonal' }), ['pause']);
  for (const reason of ['feature', 'switching', 'other'] as const) {
    assert.deepEqual(cancelOffersFor({ ...PRO, reason }), [], reason);
  }
  assert.equal(offerFor('price', 'active', true), 'discount');
  assert.deepEqual(cancelOffersFor({ ...PRO, reason: 'price' }), [offerFor('price', 'active', true)]);
});

test('cancel offers: Plus + "Too expensive" picks one of the Pro switch or 50% off', () => {
  assert.deepEqual(cancelOffersFor({ ...PLUS, reason: 'price' }), ['switch_pro', 'discount']);
  // The switch is the preselected one (design/tiers 07A).
  assert.equal(cancelOffersFor({ ...PLUS, reason: 'price' })[0], 'switch_pro');
  // During a trial the discount still lands after it, so both stand.
  assert.deepEqual(cancelOffersFor({ ...PLUS, reason: 'price', trialing: true }), ['switch_pro', 'discount']);
  // Any billing source: this is a plan change inside the store's group too.
  for (const billingSource of ['stripe', 'app_store', 'play_store'] as const) {
    assert.deepEqual(cancelOffersFor({ ...PLUS, reason: 'price', billingSource }), ['switch_pro', 'discount'], billingSource);
  }
});

test('cancel offers: pause only where the billing source supports it', () => {
  assert.equal(canPause('stripe'), true);
  assert.equal(canPause('play_store'), true);
  assert.equal(canPause('app_store'), false);
  assert.equal(canPause(null), true);

  assert.deepEqual(cancelOffersFor({ ...PLUS, reason: 'seasonal', billingSource: 'play_store' }), ['pause']);
  assert.deepEqual(cancelOffersFor({ ...PRO, reason: 'seasonal', billingSource: 'play_store' }), ['pause']);
  // iOS has no pause: that reason offers the Pro switch instead (Plus only).
  assert.deepEqual(cancelOffersFor({ ...PLUS, reason: 'seasonal', billingSource: 'app_store' }), ['switch_pro']);
  // Pro has nothing lower to switch to, so a Pro user on iOS gets no offer.
  assert.deepEqual(cancelOffersFor({ ...PRO, reason: 'seasonal', billingSource: 'app_store' }), []);
});

test('cancel offers: no pause during a trial, no offer on Free or once used', () => {
  assert.deepEqual(cancelOffersFor({ ...PRO, reason: 'seasonal', trialing: true }), []);
  assert.deepEqual(cancelOffersFor({ ...PLUS, reason: 'seasonal', trialing: true }), []);
  assert.deepEqual(cancelOffersFor({ ...PRO, reason: 'price', eligible: false }), []);
  assert.deepEqual(cancelOffersFor({ ...PLUS, reason: 'price', eligible: false }), []);
  assert.deepEqual(cancelOffersFor({ plan: 'free', reason: 'price', trialing: false, billingSource: 'stripe', eligible: true }), []);
  assert.deepEqual(cancelOffersFor({ ...PRO, reason: null }), []);
});

test('cancel offers: one offer per 12 months gates every kind', () => {
  // The 12-month window is offerEligible: every kind above reads it, so taking
  // the Pro switch spends the same window as a discount or a pause.
  const used = new Date(NOW.getTime() - OFFER_WINDOW_MS + 60_000).toISOString();
  const state = { status: 'active', cancelAtPeriodEnd: false, paused: false, retentionOfferUsedAt: used };
  const eligible = offerEligible(state, NOW);
  assert.equal(eligible, false);
  for (const reason of ['price', 'seasonal'] as const) {
    for (const plan of ['pro', 'plus'] as const) {
      assert.deepEqual(
        cancelOffersFor({ plan, reason, trialing: false, billingSource: 'stripe', eligible }),
        [],
        `${plan}/${reason}`,
      );
    }
  }
  // Once the window has passed the same user is eligible again.
  const later = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
  assert.equal(offerEligible(state, later), true);
  assert.deepEqual(cancelOffersFor({ ...PLUS, reason: 'price', eligible: true }), ['switch_pro', 'discount']);
});
