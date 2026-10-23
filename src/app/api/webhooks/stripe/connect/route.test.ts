// Layer 1 for the Connect webhook: a signed checkout.session.completed is
// POSTed to the real route handler with Supabase and the PaymentIntent lookup
// mocked, so no database row or Stripe call is ever made. Pins the ledger
// upsert payload (paid_source 'webhook', method mapping, paid_at from
// event.created, session id as the conflict key), idempotent replays, and the
// 503 / 400 error contract. Needs `--experimental-test-module-mocks` (npm test).
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';

const SECRET = 'whsec_test_layer1';
const INVOICE_ID = '3f2b6c1e-8a4d-4c1b-9e57-0a1b2c3d4e5f';
const USER_ID = '1f58b401-e1b1-41e9-b11f-df5530872007';
const ACCOUNT = 'acct_test_seller';
const CREATED = 1_760_000_000;

type Call = { payload: Record<string, unknown>; options: Record<string, unknown> };
const upserts: Call[] = [];
let seen = new Set<string>();
let pmType = 'card';

// Chainable fake of the few supabase-js calls the route makes.
const fakeAdmin = {
  from(table: string) {
    const ok = (data: unknown) => ({ data, error: null });
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => {
        if (table === 'invoices') return ok({ id: INVOICE_ID, user_id: USER_ID, invoice_number: 7, client_name: 'ZZ TEST', total: 123.45, amount_paid: 123.45, status: 'paid' });
        if (table === 'profiles') return ok({ stripe_account_id: ACCOUNT });
        if (table === 'invoice_payments') return ok({ id: 'pay-1' });
        return ok(null);
      },
      upsert: (payload: Record<string, unknown>, options: Record<string, unknown>) => {
        upserts.push({ payload, options });
        const key = String(payload[String(options.onConflict)]);
        const dup = seen.has(key);
        seen.add(key);
        return { select: async () => ok(dup ? [] : [{ id: 'pay-1' }]) };
      },
    };
    return chain;
  },
};

const stripe = new Stripe('sk_test_layer1');
(stripe.paymentIntents as unknown as { retrieve: unknown }).retrieve = async () => ({
  payment_method: { type: pmType },
});

mock.module('server-only', { namedExports: {} });
mock.module(new URL('../../../../../lib/supabase/admin.ts', import.meta.url).href, { namedExports: { adminClient: () => fakeAdmin } });
mock.module(new URL('../../../../../lib/stripe/server.ts', import.meta.url).href, { namedExports: { getStripe: () => stripe, STRIPE_API_VERSION: 'test' } });
mock.module(new URL('../../../../../lib/notify/index.ts', import.meta.url).href, { namedExports: { notify: async () => 0 } });

const { POST } = await import('./route');
const { NextRequest } = await import('next/server');

function event(over: { id?: string; sessionId?: string } = {}) {
  return JSON.stringify({
    id: over.id ?? 'evt_1',
    object: 'event',
    type: 'checkout.session.completed',
    account: ACCOUNT,
    created: CREATED,
    data: {
      object: {
        id: over.sessionId ?? 'cs_test_1',
        object: 'checkout.session',
        payment_status: 'paid',
        currency: 'usd',
        amount_total: 12345,
        payment_intent: 'pi_test_1',
        metadata: { invoice_id: INVOICE_ID },
      },
    },
  });
}

function post(payload: string, secret: string | null = SECRET) {
  const headers: Record<string, string> = {};
  if (secret) headers['stripe-signature'] = stripe.webhooks.generateTestHeaderString({ payload, secret });
  return POST(new NextRequest('http://localhost/api/webhooks/stripe/connect', { method: 'POST', body: payload, headers }));
}

beforeEach(() => {
  upserts.length = 0;
  seen = new Set();
  pmType = 'card';
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = SECRET;
});

test('signed checkout.session.completed upserts one webhook ledger row', async () => {
  const res = await post(event());
  assert.equal(res.status, 200);
  assert.equal(upserts.length, 1);
  const { payload, options } = upserts[0];
  assert.equal(payload.paid_source, 'webhook');
  assert.equal(payload.method, 'card');
  assert.equal(payload.amount, 123.45);
  assert.equal(payload.invoice_id, INVOICE_ID);
  assert.equal(payload.paid_at, new Date(CREATED * 1000).toISOString());
  assert.equal(payload.stripe_checkout_session_id, 'cs_test_1');
  assert.equal(options.onConflict, 'stripe_checkout_session_id');
  assert.equal(options.ignoreDuplicates, true);
});

test('payment method maps card→card, cashapp→cashapp, anything else→other', async () => {
  for (const [type, want] of [['card', 'card'], ['cashapp', 'cashapp'], ['us_bank_account', 'other']] as const) {
    pmType = type;
    upserts.length = 0;
    await post(event({ sessionId: `cs_${type}` }));
    assert.equal(upserts[0].payload.method, want, type);
  }
});

test('the same event twice inserts nothing the second time', async () => {
  const body = event();
  // The fake returns [] for a repeated conflict key, as ignoreDuplicates does.
  for (let i = 0; i < 2; i++) {
    const res = await post(body);
    assert.equal(res.status, 200);
  }
  assert.equal(upserts.length, 2);
  assert.equal(upserts[0].payload.stripe_checkout_session_id, upserts[1].payload.stripe_checkout_session_id);
  assert.equal(upserts[1].options.ignoreDuplicates, true);
  assert.equal(seen.size, 1);
});

test('503 when the signing secret is not configured', async () => {
  delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  const res = await post(event());
  assert.equal(res.status, 503);
  assert.equal(upserts.length, 0);
});

test('400 on a bad or missing signature, nothing recorded', async () => {
  assert.equal((await post(event(), 'whsec_wrong')).status, 400);
  assert.equal((await post(event(), null)).status, 400);
  assert.equal(upserts.length, 0);
});
