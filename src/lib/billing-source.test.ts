// The ownership rule: one TS function, one PostgREST filter string, the same
// answer for every source x current owner x current tier x written tier. Also
// pins the wiring — every Stripe billing-fact write goes through the guarded
// writer — and the case that shipped broken: a store event that derives a
// NON-live state must not cancel a live Stripe subscriber.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  billingSourceOr,
  isDoubleBilling,
  mayWriteBilling,
  type BillingSource,
} from './billing-source';
import { writeBillingFields } from './billing-write';
import { processRevenueCatEvent, type RevenueCatDeps } from './revenuecat/process';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const SYNC = read('./subscription/sync.ts');
const WEBHOOK = read('../app/api/webhooks/stripe/route.ts');

const USER = '11111111-2222-3333-4444-555555555555';
const WRITERS: BillingSource[] = ['stripe', 'app_store', 'play_store'];
const OWNERS = [null, 'stripe', 'app_store', 'play_store', 'legacy'];
const TIERS = ['trialing', 'active', 'past_due', 'canceled', 'free', null];
const WRITTEN_TIERS = ['trialing', 'active', 'past_due', 'canceled', 'free', null];

/** Split the or= filter on the commas BETWEEN clauses (the not.in list has its
 *  own commas). */
function clausesFor(writer: BillingSource, writtenTier: string | null | undefined): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of billingSourceOr(writer, writtenTier)) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(current); current = ''; continue; }
    current += ch;
  }
  if (current) out.push(current);
  return out;
}

type Row = { id: string; access_tier: string | null; billing_source: string | null };

/** Evaluate one clause the way the database would. */
function evalClause(clause: string, row: Row): boolean {
  const c = clause.trim();
  if (c === 'billing_source.is.null') return row.billing_source == null;
  if (c === 'access_tier.is.null') return row.access_tier == null;
  const eq = c.match(/^billing_source\.eq\.(\w+)$/);
  if (eq) return row.billing_source === eq[1];
  const notIn = c.match(/^access_tier\.not\.in\.\(([^)]*)\)$/);
  if (notIn) return row.access_tier != null && !notIn[1].split(',').includes(row.access_tier);
  const founder = c.match(/^access_tier\.neq\.(\w+)$/);
  if (founder) return row.access_tier !== founder[1];
  throw new Error(`unexpected clause: ${c}`);
}

/** An or= filter: the clauses inside it are OR'd. */
function filterAllows(writer: BillingSource, row: Row, writtenTier: string | null | undefined): boolean {
  return clausesFor(writer, writtenTier).some((clause) => evalClause(clause, row));
}

/** A tiny in-memory profiles table that applies the real UPDATE's WHERE. */
function fakeDb(initial: Row) {
  const row: Row = { ...initial };
  const client = {
    from(_table: string) {
      return {
        select(_cols?: string) {
          const api: any = {
            _filter: 'id' as 'id' | 'customer',
            _value: '',
            eq(col: string, value: string) {
              api._filter = col === 'stripe_customer_id' ? 'customer' : 'id';
              api._value = value;
              return api;
            },
            maybeSingle: async () => ({
              data: api._filter === 'id' && api._value === row.id ? { ...row } : null,
              error: null,
            }),
          };
          return api;
        },
        update(payload: Record<string, unknown>) {
          const api: any = {
            _match: ['id', ''] as [string, string],
            _or: null as string | null,
            eq(col: string, value: string) { api._match = [col, value]; return api; },
            or(filter: string) { api._or = filter; return api; },
            select(_cols?: string) { return api; },
            run() {
              const hit = api._match[0] === 'id' && row.id === api._match[1];
              const allowed = api._or == null ? true : evalClauseList(api._or, row);
              if (!hit || !allowed) return [];
              Object.assign(row, payload);
              return [{ id: row.id }];
            },
            // PostgREST answers with { data, error } — the caller destructures it.
            then(res: unknown, rej: unknown) {
              return Promise.resolve({ data: api.run(), error: null }).then(res as never, rej as never);
            },
          };
          return api;
        },
      };
    },
  };
  return { client, row };
}

/** An or= filter as one test: every clause OR'd together. */
function evalClauseList(filter: string, row: Row): boolean {
  return clausesOf(filter).some((clause) => evalClause(clause, row));
}

function clausesOf(filter: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of filter) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(current); current = ''; continue; }
    current += ch;
  }
  if (current) out.push(current);
  return out;
}

function captureWarnings<T>(run: () => T): { result: T; lines: string[] } {
  const lines: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
  try {
    const result = run();
    return { result, lines };
  } finally {
    console.warn = original;
  }
}

// ── The rule ─────────────────────────────────────────────────────────────

test('source rule: the TS decision and the UPDATE filter agree, always', () => {
  for (const writer of WRITERS) {
    for (const owner of OWNERS) {
      for (const tier of TIERS) {
        for (const writtenTier of WRITTEN_TIERS) {
          const row: Row = { id: USER, access_tier: tier, billing_source: owner };
          assert.equal(
            mayWriteBilling(writer, owner, tier, writtenTier),
            filterAllows(writer, row, writtenTier),
            `${writer} over ${String(owner)} on ${String(tier)} → ${String(writtenTier)}`,
          );
        }
      }
    }
  }
});

test('source rule: an unowned or lapsed profile is writable by either side', () => {
  for (const writer of WRITERS) {
    assert.equal(mayWriteBilling(writer, null, 'active', 'active'), true);
    for (const tier of ['canceled', 'free', null]) {
      assert.equal(mayWriteBilling(writer, 'stripe', tier, 'canceled'), true);
      assert.equal(mayWriteBilling(writer, 'app_store', tier, 'canceled'), true);
    }
  }
});

test('source rule: the owner keeps a live profile; the other side is refused', () => {
  for (const tier of ['trialing', 'active', 'past_due']) {
    assert.equal(mayWriteBilling('stripe', 'stripe', tier, 'active'), true);
    assert.equal(mayWriteBilling('app_store', 'app_store', tier, 'canceled'), true);
    assert.equal(mayWriteBilling('play_store', 'play_store', tier, 'canceled'), true);
    // A live store profile is not Stripe's to rewrite (the phase 1 bug).
    assert.equal(mayWriteBilling('stripe', 'app_store', tier, 'active'), false);
    assert.equal(mayWriteBilling('stripe', 'play_store', tier, 'canceled'), false);
  }
});

test('source rule: a store purchase wins over live Stripe only when it grants access', () => {
  for (const store of ['app_store', 'play_store'] as BillingSource[]) {
    for (const tier of ['trialing', 'active', 'past_due']) {
      assert.equal(mayWriteBilling(store, 'stripe', tier, tier), true, `${store} on ${tier}`);
      // The bug: a lapsed store state must not cancel the Stripe subscriber.
      assert.equal(mayWriteBilling(store, 'stripe', tier, 'canceled'), false, `${store} → canceled`);
      assert.equal(mayWriteBilling(store, 'stripe', tier, 'free'), false, `${store} → free`);
      assert.equal(mayWriteBilling(store, 'stripe', tier, null), false, `${store} → no tier`);
    }
    // ...and only the live-over-live case is double billing.
    assert.equal(isDoubleBilling(store, 'stripe', 'active', 'active'), true);
    assert.equal(isDoubleBilling(store, 'stripe', 'active', 'canceled'), false);
    assert.equal(isDoubleBilling(store, 'stripe', 'canceled', 'active'), false);
    assert.equal(isDoubleBilling(store, 'app_store', 'active', 'active'), false);
    assert.equal(isDoubleBilling('stripe', 'stripe', 'active', 'active'), false);
  }
});

test('source rule: the filter encodes it in SQL, not in the caller', () => {
  const stripe = clausesFor('stripe', 'active');
  assert.ok(stripe.includes('billing_source.is.null'));
  assert.ok(stripe.includes('billing_source.eq.stripe'));
  assert.ok(stripe.includes('access_tier.not.in.(trialing,active,past_due)'));
  assert.ok(!stripe.includes('billing_source.eq.app_store'));
  // Stripe's filter never depends on the tier it writes.
  assert.deepEqual(clausesFor('stripe', 'canceled'), stripe);

  for (const store of ['app_store', 'play_store'] as BillingSource[]) {
    const live = clausesFor(store, 'active');
    assert.ok(live.includes(`billing_source.eq.${store}`));
    assert.ok(live.includes('billing_source.eq.stripe'), 'store may take over live Stripe to grant access');
    // A non-live store write gets the plain rule: no Stripe override.
    for (const tier of ['canceled', 'free', null]) {
      assert.ok(!clausesFor(store, tier).includes('billing_source.eq.stripe'), `${store} → ${String(tier)}`);
    }
  }
});

// ── The writer, against a fake table that applies the WHERE ──────────────

test('writer: a store cancellation cannot overwrite a live Stripe subscriber', async () => {
  const { client, row } = fakeDb({ id: USER, access_tier: 'active', billing_source: 'stripe' });
  const { result: wrote, lines } = await captureAsyncWarnings(() =>
    writeBillingFields(client as never, {
      writer: 'app_store',
      match: { id: USER },
      fields: { access_tier: 'canceled', current_period_end: null, cancel_at_period_end: false, trial_ends_at: null },
      guardFounder: false,
    }));
  assert.equal(wrote, false);
  assert.deepEqual(row, { id: USER, access_tier: 'active', billing_source: 'stripe' });
  assert.equal(lines.length, 1, 'one line explains the skip');
  assert.match(lines[0], /write skipped: another source owns a live subscription/);
  assert.doesNotMatch(lines.join('\n'), /double_billing/);
});

test('writer: an active store purchase takes over a live Stripe subscriber', async () => {
  const { client, row } = fakeDb({ id: USER, access_tier: 'active', billing_source: 'stripe' });
  const { result: wrote, lines } = await captureAsyncWarnings(() =>
    writeBillingFields(client as never, {
      writer: 'play_store',
      match: { id: USER },
      fields: { access_tier: 'active', plan: 'plus', current_period_end: '2027-01-01T00:00:00Z' },
      guardFounder: false,
    }));
  assert.equal(wrote, true);
  assert.equal(row.billing_source, 'play_store');
  assert.equal(row.access_tier, 'active');
  assert.ok(lines.some((l) => l.startsWith('double_billing')), 'double_billing is logged');
  assert.match(lines.find((l) => l.startsWith('double_billing')) ?? '', new RegExp(USER));
});

test('writer: the store may still cancel its OWN lapsed-state profile', async () => {
  const { client, row } = fakeDb({ id: USER, access_tier: 'active', billing_source: 'app_store' });
  const { result: wrote } = await captureAsyncWarnings(() =>
    writeBillingFields(client as never, {
      writer: 'app_store',
      match: { id: USER },
      fields: { access_tier: 'canceled', current_period_end: null },
      guardFounder: false,
    }));
  assert.equal(wrote, true);
  assert.equal(row.access_tier, 'canceled');
  assert.equal(row.billing_source, 'app_store');
});

/** The writer logs after an awaited UPDATE, so warnings must be captured across
 *  the await: patch for the whole promise. */
async function captureAsyncWarnings<T>(run: () => Promise<T>): Promise<{ result: T; lines: string[] }> {
  const lines: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
  try {
    return { result: await run(), lines };
  } finally {
    console.warn = original;
  }
}

// ── End to end: a lapsed store event on a Stripe subscriber ──────────────

test('process: a lapsed store event leaves a live Stripe subscriber untouched and is still a 200', async () => {
  const { client, row } = fakeDb({ id: USER, access_tier: 'active', billing_source: 'stripe' });
  const marked: string[] = [];
  const deps: RevenueCatDeps = {
    claimEvent: async () => 'claimed',
    markProcessed: async (id) => { marked.push(id); },
    findProfile: async () => ({
      id: USER, access_tier: row.access_tier, billing_source: row.billing_source,
      plan: 'pro', plan_change_to: null, plan_change_at: null,
    }),
    fetchSubscriber: async () => ({
      entitlements: { pro: { product_identifier: 'onit_pro_monthly', expires_date: '2026-11-01T12:00:00Z' } },
      subscriptions: { onit_pro_monthly: { expires_date: '2026-11-01T12:00:00Z', store: 'app_store' } },
    }),
    writeProfile: async ({ userId, source, fields }) =>
      writeBillingFields(client as never, { writer: source, match: { id: userId }, fields, guardFounder: true }),
    log: () => {},
    now: () => new Date('2026-12-01T12:00:00Z'),
  };
  const { result: res, lines } = await captureAsyncWarnings(() =>
    processRevenueCatEvent({
      id: 'evt_late_expiration', type: 'EXPIRATION', appUserId: USER, environment: 'PRODUCTION',
      store: 'APP_STORE', newProductId: null, transferredFrom: [], transferredTo: [],
    }, deps));
  assert.equal(res.status, 200);
  assert.equal(res.body.outcome, 'processed');
  assert.deepEqual(marked, ['evt_late_expiration'], 'the event is marked processed');
  assert.deepEqual(row, { id: USER, access_tier: 'active', billing_source: 'stripe' });
  assert.ok(lines.some((l) => /write skipped: another source owns a live subscription/.test(l)));
});

// ── Wiring ──────────────────────────────────────────────────────────────

test('wiring: every Stripe billing write goes through the guarded writer', () => {
  assert.match(SYNC, /writeBillingFields\(supabase, write\)/);
  assert.doesNotMatch(SYNC, /\.update\(\{[\s\S]*profileFieldsFor/, 'no unguarded facts update');
  assert.doesNotMatch(WEBHOOK, /\.update\(\{\s*\n\s*subscription_status/, 'no unguarded deleted-case update');
  assert.match(read('./billing-write.ts'), /access_tier\.is\.null,access_tier\.neq\.founder/);
  // The tier written by the UPDATE is what gates the store exception.
  assert.match(read('./billing-write.ts'), /billingSourceOr\(write\.writer, writtenTier\)/);
  assert.match(SYNC, /writeStripe\(supabase, match, \{ access_tier: tier \}, true\)/);
  assert.match(SYNC, /writeStripe\(supabase, match, \{ plan \}, true\)/);
  assert.match(SYNC, /stripe_customer_id: customerId,[\s\S]*\.\.\.profileFieldsFor\(sub\),[\s\S]*\}, false\)/);
});

test('wiring: stripe_customer_id from checkout stays an unguarded identifier write', () => {
  assert.match(
    WEBHOOK,
    /\.from\('profiles'\)\.update\(\{ stripe_customer_id: customerId \}\)\.eq\('id', userId\)/,
  );
});
