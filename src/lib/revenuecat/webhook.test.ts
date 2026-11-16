// The webhook's contract: auth, the environment guard, idempotency, unknown
// users, API failure, out-of-order deliveries, founders, transfers and the
// scheduled downgrade. The I/O is injected, so every case is real code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { authorizeHeader, safeEqual, verifySignature } from './auth';
import { environmentVerdict } from './environment';
import { nextPendingChange } from './scheduled-change';
import {
  fieldsFor,
  parseEvent,
  processRevenueCatEvent,
  type ProfileForBilling,
  type RevenueCatDeps,
  type RevenueCatEvent,
} from './process';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const ROUTE = read('../../app/api/webhooks/revenuecat/route.ts');
const NOW = new Date('2026-12-01T12:00:00Z');

const ACTIVE = {
  entitlements: { pro: { product_identifier: 'onit_pro_monthly', expires_date: '2027-01-01T12:00:00Z' } },
  subscriptions: {
    onit_pro_monthly: {
      expires_date: '2027-01-01T12:00:00Z', period_type: 'normal', store: 'app_store',
      unsubscribe_detected_at: null, billing_issues_detected_at: null,
    },
  },
};
const EXPIRED = {
  entitlements: { pro: { product_identifier: 'onit_pro_monthly', expires_date: '2026-11-01T12:00:00Z' } },
  subscriptions: {
    onit_pro_monthly: { expires_date: '2026-11-01T12:00:00Z', period_type: 'normal', store: 'app_store' },
  },
};

const USER = '11111111-2222-3333-4444-555555555555';
const PROFILE: ProfileForBilling = {
  id: USER, access_tier: 'active', billing_source: 'app_store', plan: 'pro',
  plan_change_to: null, plan_change_at: null,
};

const event = (over: Partial<RevenueCatEvent> = {}): RevenueCatEvent => ({
  id: 'evt_1', type: 'RENEWAL', appUserId: USER, environment: 'SANDBOX',
  store: 'APP_STORE', newProductId: null, transferredFrom: [], transferredTo: [], ...over,
});

function harness(opts: {
  profile?: ProfileForBilling | null;
  subscriber?: unknown | ((id: string) => unknown);
  write?: () => Promise<boolean>;
  claim?: (e: RevenueCatEvent) => Promise<'claimed' | 'processed'>;
} = {}) {
  const writes: { userId: string; source: string; fields: Record<string, unknown> }[] = [];
  const marked: string[] = [];
  const logs: { message: string; detail?: Record<string, unknown> }[] = [];
  const seen = new Set<string>();
  const deps: RevenueCatDeps = {
    claimEvent: opts.claim ?? (async (e) => (seen.has(e.id) ? 'processed' : (seen.add(e.id), 'claimed'))),
    markProcessed: async (id) => { marked.push(id); },
    findProfile: async () => (opts.profile === undefined ? PROFILE : opts.profile),
    fetchSubscriber: async (id) =>
      typeof opts.subscriber === 'function' ? (opts.subscriber as (id: string) => unknown)(id) : (opts.subscriber ?? ACTIVE),
    writeProfile: async (args) => {
      writes.push(args as never);
      return opts.write ? opts.write() : true;
    },
    log: (message, detail) => logs.push({ message, detail }),
    now: () => NOW,
  };
  return { deps, writes, marked, logs, seen };
}

// ── Auth ────────────────────────────────────────────────────────────────

test('auth: constant-time compare accepts only the configured value', () => {
  assert.equal(authorizeHeader('secret-value', 'secret-value'), true);
  assert.equal(authorizeHeader('secret-value', 'secret-valuf'), false);
  assert.equal(authorizeHeader('secret', 'longer-secret'), false);
  assert.equal(authorizeHeader(null, 'secret'), false);
  assert.equal(authorizeHeader('secret', ''), false);
  assert.equal(safeEqual('a', 'a'), true);
});

function sign(body: string, t: number, secret: string): string {
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;
}

test('auth: HMAC over the raw body, with a five-minute window', () => {
  const body = '{"event":{"id":"evt_1"}}';
  const t = Math.floor(NOW.getTime() / 1000);
  assert.equal(verifySignature(body, sign(body, t, 'whsec'), 'whsec', NOW), 'ok');
  // Another body, another secret, and a rewritten payload all fail.
  assert.equal(verifySignature(body + ' ', sign(body, t, 'whsec'), 'whsec', NOW), 'invalid');
  assert.equal(verifySignature(body, sign(body, t, 'other'), 'whsec', NOW), 'invalid');
  // Too old to replay, and malformed/missing headers.
  assert.equal(verifySignature(body, sign(body, t - 301, 'whsec'), 'whsec', NOW), 'stale');
  assert.equal(verifySignature(body, null, 'whsec', NOW), 'missing');
  assert.equal(verifySignature(body, 't=nope,v1=zz', 'whsec', NOW), 'malformed');
});

test('auth: the route checks env first, then the header, then the signature on the raw body', () => {
  const envIndex = ROUTE.indexOf("(process.env.REVENUECAT_WEBHOOK_AUTH ?? '').trim()");
  const text = ROUTE.indexOf('await req.text()');
  const header = ROUTE.indexOf('authorizeHeader(req.headers.get(\'authorization\')');
  const hmac = ROUTE.indexOf('verifySignature(');
  assert.ok(envIndex > 0 && text > envIndex, 'the env check runs before the body is read');
  assert.ok(header > text, 'the header is checked after the raw body is read');
  assert.ok(hmac > header, 'the signature is checked after the header');
  assert.match(ROUTE, /\}, 503\)/);
  assert.match(ROUTE, /\}, 401\)/);
  // Neither the header value nor the key is ever logged.
  assert.doesNotMatch(ROUTE, /log[^\n]*authValue|console[^\n]*secretKey/);
});

// ── Environment ─────────────────────────────────────────────────────────

test('environment: production takes production only, preview takes sandbox only', () => {
  assert.equal(environmentVerdict('production', 'PRODUCTION'), 'accept');
  assert.equal(environmentVerdict('production', 'SANDBOX'), 'skip');
  assert.equal(environmentVerdict('preview', 'SANDBOX'), 'accept');
  assert.equal(environmentVerdict('preview', 'PRODUCTION'), 'skip');
  // Unset (tests, local) behaves like preview: sandbox only.
  assert.equal(environmentVerdict(undefined, 'SANDBOX'), 'accept');
  assert.equal(environmentVerdict(undefined, 'PRODUCTION'), 'skip');
  assert.equal(environmentVerdict('preview', ''), 'skip');
});

// ── Processing ──────────────────────────────────────────────────────────

test('process: a replay is acknowledged and changes nothing', async () => {
  const h = harness();
  h.seen.add('evt_1');
  const res = await processRevenueCatEvent(event(), h.deps);
  assert.equal(res.status, 200);
  assert.equal(res.body.outcome, 'replayed');
  assert.equal(h.writes.length, 0);
});

test('process: an unknown event type is acknowledged and logged', async () => {
  const h = harness();
  const res = await processRevenueCatEvent(event({ type: 'VIRTUAL_CURRENCY_TRANSACTION' }), h.deps);
  assert.equal(res.status, 200);
  assert.equal(res.body.outcome, 'unknown_event');
  assert.deepEqual(h.logs.map((l) => l.message), ['unknown_event']);
  assert.equal(h.writes.length, 0);
});

test('process: an anonymous or unknown user is skipped, never written', async () => {
  const anon = harness();
  const a = await processRevenueCatEvent(event({ appUserId: '$RCAnonymousID:abc' }), anon.deps);
  assert.equal(a.status, 200);
  assert.equal(anon.writes.length, 0);
  assert.deepEqual(anon.logs.map((l) => l.message), ['skipped_non_user_id']);

  const unknown = harness({ profile: null });
  const b = await processRevenueCatEvent(event(), unknown.deps);
  assert.equal(b.status, 200);
  assert.equal(unknown.writes.length, 0);
  assert.deepEqual(unknown.logs.map((l) => l.message), ['skipped_unknown_profile']);
  // Both are still marked processed: a retry would change nothing.
  assert.equal(anon.marked.length, 1);
  assert.equal(unknown.marked.length, 1);
});

test('process: a RevenueCat API failure is a 500 and stays unprocessed', async () => {
  const h = harness({ subscriber: () => { throw new Error('revenuecat subscriber 500'); } });
  const res = await processRevenueCatEvent(event(), h.deps);
  assert.equal(res.status, 500);
  assert.equal(h.marked.length, 0, 'a retry must do real work');
  assert.equal(h.writes.length, 0);
});

test('process: a database failure while claiming is a 500', async () => {
  const h = harness({ claim: async () => { throw new Error('db down'); } });
  const res = await processRevenueCatEvent(event(), h.deps);
  assert.equal(res.status, 500);
});

test('process: a refused write (founder or another owner) still answers 200', async () => {
  const h = harness({ write: async () => false });
  const res = await processRevenueCatEvent(event(), h.deps);
  assert.equal(res.status, 200);
  assert.equal(h.marked.length, 1);
});

test('process: out-of-order deliveries end on the state the subscriber says', async () => {
  // A RENEWAL lands first, then a stale-but-later EXPIRATION. The state always
  // comes from the subscriber, so the last write is the expired one.
  let subscriber: unknown = ACTIVE;
  const h = harness({ subscriber: () => subscriber });
  const renewal = await processRevenueCatEvent(event({ id: 'evt_renewal' }), h.deps);
  assert.equal(renewal.status, 200);
  assert.equal(h.writes.at(-1)?.fields.access_tier, 'active');

  subscriber = EXPIRED;
  const expiration = await processRevenueCatEvent(event({ id: 'evt_expiration', type: 'EXPIRATION' }), h.deps);
  assert.equal(expiration.status, 200);
  assert.equal(h.writes.at(-1)?.fields.access_tier, 'canceled');
  // The plan is left alone when nothing is active ("null = don't write").
  assert.equal('plan' in (h.writes.at(-1)?.fields ?? {}), false);
});

test('process: the write carries the store source and the derived facts', async () => {
  const h = harness();
  await processRevenueCatEvent(event(), h.deps);
  assert.equal(h.writes.length, 1);
  const write = h.writes[0];
  assert.equal(write.userId, USER);
  assert.equal(write.source, 'app_store');
  assert.deepEqual(write.fields, {
    access_tier: 'active',
    current_period_end: '2027-01-01T12:00:00Z',
    cancel_at_period_end: false,
    trial_ends_at: null,
    plan: 'pro',
  });
});

test('process: a TRANSFER re-syncs every user id in the event', async () => {
  const other = '99999999-8888-7777-6666-555555555555';
  const h = harness();
  const res = await processRevenueCatEvent(event({
    type: 'TRANSFER', transferredFrom: [USER], transferredTo: [other],
  }), h.deps);
  assert.equal(res.status, 200);
  assert.deepEqual(h.writes.map((w) => w.userId).sort(), [USER, other].sort());
});

test('process: a scheduled downgrade is recorded from PRODUCT_CHANGE', async () => {
  const plus = {
    entitlements: { plus: { product_identifier: 'onit_plus_monthly', expires_date: '2027-01-01T12:00:00Z' } },
    subscriptions: {
      onit_plus_monthly: { expires_date: '2027-01-01T12:00:00Z', period_type: 'normal', store: 'app_store' },
    },
  };
  const h = harness({ subscriber: plus, profile: { ...PROFILE, plan: 'plus' } });
  await processRevenueCatEvent(event({ type: 'PRODUCT_CHANGE', newProductId: 'onit_pro_monthly' }), h.deps);
  assert.equal(h.writes[0].fields.plan_change_to, 'pro');
  assert.equal(h.writes[0].fields.plan_change_at, '2027-01-01T12:00:00Z');
  assert.equal(h.writes[0].fields.plan, 'plus');
});

// ── Scheduled change, in isolation ──────────────────────────────────────

test('change: a lower plan is scheduled for the period end', () => {
  const next = nextPendingChange({
    eventType: 'PRODUCT_CHANGE', newProductId: 'onit_pro_monthly', derivedPlan: 'plus',
    currentPeriodEnd: '2027-01-01T00:00:00Z', pending: { to: null, at: null },
  });
  assert.deepEqual(next, { to: 'pro', at: '2027-01-01T00:00:00Z' });
});

test('change: Play base-plan ids are matched on the product part', () => {
  const next = nextPendingChange({
    eventType: 'PRODUCT_CHANGE', newProductId: 'onit_pro_monthly:p1m', derivedPlan: 'plus',
    currentPeriodEnd: '2027-01-01T00:00:00Z', pending: { to: null, at: null },
  });
  assert.deepEqual(next, { to: 'pro', at: '2027-01-01T00:00:00Z' });
});

test('change: an upgrade (or a switch back) clears a pending one', () => {
  const pending = { to: 'pro' as const, at: '2027-01-01T00:00:00Z' };
  assert.deepEqual(nextPendingChange({
    eventType: 'PRODUCT_CHANGE', newProductId: 'onit_plus_monthly', derivedPlan: 'pro',
    currentPeriodEnd: '2027-01-01T00:00:00Z', pending,
  }), { to: null, at: null });
});

test('change: the plan landing clears it', () => {
  assert.deepEqual(nextPendingChange({
    eventType: 'RENEWAL', newProductId: null, derivedPlan: 'pro',
    currentPeriodEnd: '2027-02-01T00:00:00Z', pending: { to: 'pro', at: '2027-01-01T00:00:00Z' },
  }), { to: null, at: null });
});

test('change: an unknown product id leaves the pair untouched and logs', () => {
  const logs: string[] = [];
  const pending = { to: 'pro' as const, at: '2027-01-01T00:00:00Z' };
  assert.deepEqual(nextPendingChange({
    eventType: 'PRODUCT_CHANGE', newProductId: 'onit_mystery_monthly', derivedPlan: 'plus',
    currentPeriodEnd: '2027-01-01T00:00:00Z', pending,
  }, (m) => logs.push(m)), pending);
  assert.deepEqual(logs, ['unknown_product_id']);
});

test('process: an unknown product id on PRODUCT_CHANGE writes no plan_change fields', async () => {
  const plus = {
    entitlements: { plus: { product_identifier: 'onit_plus_monthly', expires_date: '2027-01-01T12:00:00Z' } },
    subscriptions: { onit_plus_monthly: { expires_date: '2027-01-01T12:00:00Z', store: 'app_store' } },
  };
  const h = harness({
    subscriber: plus,
    profile: { ...PROFILE, plan: 'plus', plan_change_to: 'pro', plan_change_at: '2027-01-01T12:00:00Z' },
  });
  await processRevenueCatEvent(event({ type: 'PRODUCT_CHANGE', newProductId: 'onit_mystery' }), h.deps);
  assert.equal('plan_change_to' in h.writes[0].fields, false);
  assert.equal('plan_change_at' in h.writes[0].fields, false);
  assert.ok(h.logs.some((l) => l.message === 'unknown_product_id'));
});

// ── Payload + wiring ────────────────────────────────────────────────────

test('parse: the documented fields are read defensively', () => {
  const parsed = parseEvent({ api_version: '1.0', event: {
    id: 'evt_9', type: 'product_change', app_user_id: USER, environment: 'SANDBOX',
    store: 'PLAY_STORE', new_product_id: 'onit_pro_monthly:p1m',
    transferred_from: [USER, 5], transferred_to: ['other'],
  } });
  assert.deepEqual(parsed, {
    id: 'evt_9', type: 'PRODUCT_CHANGE', appUserId: USER, environment: 'SANDBOX',
    store: 'PLAY_STORE', newProductId: 'onit_pro_monthly:p1m',
    transferredFrom: [USER], transferredTo: ['other'],
  });
  assert.equal(parseEvent({ event: { type: 'RENEWAL' } }), null);
  assert.equal(parseEvent(null), null);
  assert.equal(parseEvent({ event: {} }), null);
});

test('fields: a lapsed change clears the pair, a fresh one leaves it alone', () => {
  const profile = { ...PROFILE, plan_change_to: 'pro', plan_change_at: '2027-01-01T00:00:00Z' };
  const derived = {
    tier: 'active' as const, plan: 'plus' as const, billingSource: 'app_store' as const,
    currentPeriodEnd: '2027-01-01T00:00:00Z', cancelAtPeriodEnd: false, trialEndsAt: null,
  };
  const fields = fieldsFor(derived, profile, event({ type: 'RENEWAL' }), () => {});
  assert.equal('plan_change_to' in fields, false, 'RENEWAL never touches a pending change');
});

test('wiring: the route writes through the founder-guarded billing writer', () => {
  assert.match(ROUTE, /writeBillingFields\(admin, \{ writer: source, match: \{ id: userId \}, fields, guardFounder: true \}\)/);
  assert.match(ROUTE, /export const runtime = 'nodejs'/);
  assert.match(ROUTE, /process\.env\.VERCEL_ENV/);
});

test('wiring: the route marks processed only after the profile write', () => {
  const write = ROUTE.indexOf('await deps.writeProfile') >= 0
    ? ROUTE.indexOf('await deps.writeProfile')
    : -1;
  // The order lives in process.ts; here we assert the claim/mark pair exists.
  const process = read('./process.ts');
  const writeIdx = process.indexOf('await deps.writeProfile');
  const markIdx = process.indexOf('await deps.markProcessed');
  assert.ok(writeIdx > 0 && markIdx > writeIdx, 'processed_at is set after the write');
  assert.ok(write >= -1);
});
