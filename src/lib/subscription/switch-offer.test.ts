import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { switchProDecision } from './switch-offer';
import { OFFER_WINDOW_MS } from './offers';

const NOW = new Date('2026-11-17T12:00:00Z');
const LIVE = { status: 'active', cancelAtPeriodEnd: false, paused: false, retentionOfferUsedAt: null };

test('switch to Pro: a Plus user with no offer used may take it', () => {
  assert.deepEqual(
    switchProDecision({ plan: 'plus', offer: LIVE, billingSource: 'stripe', now: NOW, tiersOn: true }),
    { ok: true },
  );
});

test('switch to Pro: a Pro user cannot take it', () => {
  assert.deepEqual(
    switchProDecision({ plan: 'pro', offer: LIVE, now: NOW, tiersOn: true }),
    { ok: false, error: 'not_eligible' },
  );
  assert.deepEqual(
    switchProDecision({ plan: 'free', offer: LIVE, now: NOW, tiersOn: true }),
    { ok: false, error: 'not_eligible' },
  );
});

test('switch to Pro: a second offer inside 12 months is refused', () => {
  const inside = new Date(NOW.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
  assert.deepEqual(
    switchProDecision({ plan: 'plus', offer: { ...LIVE, retentionOfferUsedAt: inside }, now: NOW, tiersOn: true }),
    { ok: false, error: 'not_eligible' },
  );

  const outside = new Date(NOW.getTime() - OFFER_WINDOW_MS - 24 * 60 * 60 * 1000).toISOString();
  assert.deepEqual(
    switchProDecision({ plan: 'plus', offer: { ...LIVE, retentionOfferUsedAt: outside }, now: NOW, tiersOn: true }),
    { ok: true },
  );
});

test('switch to Pro: only a live subscription that is not already canceling or paused', () => {
  for (const offer of [
    { ...LIVE, status: 'past_due' },
    { ...LIVE, status: 'canceled' },
    { ...LIVE, cancelAtPeriodEnd: true },
    { ...LIVE, paused: true },
  ]) {
    assert.deepEqual(
      switchProDecision({ plan: 'plus', offer, now: NOW, tiersOn: true }),
      { ok: false, error: 'not_eligible' },
      offer.status,
    );
  }
  // A trial may switch: the store applies it at renewal, like any downgrade.
  assert.deepEqual(
    switchProDecision({ plan: 'plus', offer: { ...LIVE, status: 'trialing' }, now: NOW, tiersOn: true }),
    { ok: true },
  );
});

test('switch to Pro: a store account allows it (a change inside the store group)', () => {
  assert.deepEqual(
    switchProDecision({ plan: 'plus', offer: LIVE, billingSource: 'app_store', now: NOW, tiersOn: true }),
    { ok: true },
  );
  assert.deepEqual(
    switchProDecision({ plan: 'plus', offer: LIVE, billingSource: 'play_store', now: NOW, tiersOn: true }),
    { ok: true },
  );
});

test('switch to Pro: with the flag off the kind does not exist', () => {
  assert.deepEqual(
    switchProDecision({ plan: 'plus', offer: LIVE, now: NOW, tiersOn: false }),
    { ok: false, error: 'not_available' },
  );
});

test('offer route: the switch claims the 12-month window atomically, then records it', () => {
  const src = readFileSync(new URL('../../app/api/subscription/offer/route.ts', import.meta.url), 'utf8');
  // Flag-gated kind.
  assert.match(src, /NEXT_PUBLIC_TIERS/);
  // The one atomic claim every offer uses, before anything else is written.
  assert.match(src, /retention_offer_used_at: now\.toISOString\(\)/);
  assert.match(src, /\.or\(`retention_offer_used_at\.is\.null,/);
  // The recorded event, with the reason the cancel_events check allows.
  assert.match(src, /kind: 'offer_switch_pro', reason: 'price'/);
  assert.ok(
    src.indexOf('retention_offer_used_at: now.toISOString()') < src.indexOf("kind: 'offer_switch_pro'"),
    'the claim comes before the log',
  );
});
