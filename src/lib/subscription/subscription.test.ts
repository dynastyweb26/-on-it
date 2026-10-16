import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accessEndsISO, PAUSE_FROM_KEY, pauseStartsAt, profileFieldsFor, tierForSubscription, tierFromStatus } from './state';
import { offerAllowed, offerEligible, offerFor, OFFER_WINDOW_MS, pauseResumesAt, type OfferState } from './offers';
import { averageDaysToPaid, statTiles } from './stats';
import { cleanDetail, isCancelReason } from './reasons';
import { discountLine, endsWithPlanLine, freePlanAfterLine, offerNotice, pausedLine, pauseOfferLine } from './copy';
import { cancellationEmail } from '../email/cancellation';

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
