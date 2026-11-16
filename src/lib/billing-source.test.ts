// The ownership rule: one TS function, one PostgREST filter string, the same
// answer for every source x current owner x tier. Also pins the wiring — every
// Stripe billing-fact write goes through the guarded writer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  billingSourceOr,
  isDoubleBilling,
  mayWriteBilling,
  type BillingSource,
} from './billing-source';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const SYNC = read('./subscription/sync.ts');
const WEBHOOK = read('../app/api/webhooks/stripe/route.ts');

const WRITERS: BillingSource[] = ['stripe', 'app_store', 'play_store'];
const OWNERS = [null, 'stripe', 'app_store', 'play_store', 'legacy'];
const TIERS = ['trialing', 'active', 'past_due', 'canceled', 'free', null];

/** Split the or= filter on the commas BETWEEN clauses (the not.in list has its
 *  own commas). */
function clausesFor(writer: BillingSource): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of billingSourceOr(writer)) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(current); current = ''; continue; }
    current += ch;
  }
  if (current) out.push(current);
  return out;
}

/** Evaluate the generated PostgREST filter the way the database would. */
function filterAllows(writer: BillingSource, owner: string | null, tier: string | null): boolean {
  const clauses = clausesFor(writer);
  return clauses.some((clause) => {
    const c = clause.trim();
    if (c === 'billing_source.is.null') return owner == null;
    if (c === 'access_tier.is.null') return tier == null;
    const eq = c.match(/^billing_source\.eq\.(\w+)$/);
    if (eq) return owner === eq[1];
    const notIn = c.match(/^access_tier\.not\.in\.\(([^)]*)\)$/);
    if (notIn) return tier != null && !notIn[1].split(',').includes(tier);
    throw new Error(`unexpected clause: ${c}`);
  });
}

test('source rule: the TS decision and the UPDATE filter agree, always', () => {
  for (const writer of WRITERS) {
    for (const owner of OWNERS) {
      for (const tier of TIERS) {
        assert.equal(
          mayWriteBilling(writer, owner, tier),
          filterAllows(writer, owner, tier),
          `${writer} over ${String(owner)} on ${String(tier)}`,
        );
      }
    }
  }
});

test('source rule: an unowned or lapsed profile is writable by either side', () => {
  for (const writer of WRITERS) {
    assert.equal(mayWriteBilling(writer, null, 'active'), true);
    for (const tier of ['canceled', 'free', null]) {
      assert.equal(mayWriteBilling(writer, 'stripe', tier), true);
      assert.equal(mayWriteBilling(writer, 'app_store', tier), true);
    }
  }
});

test('source rule: the owner keeps a live profile; the other side is refused', () => {
  for (const tier of ['trialing', 'active', 'past_due']) {
    assert.equal(mayWriteBilling('stripe', 'stripe', tier), true);
    assert.equal(mayWriteBilling('app_store', 'app_store', tier), true);
    assert.equal(mayWriteBilling('play_store', 'play_store', tier), true);
    // A live store profile is not Stripe's to rewrite (the phase 1 bug).
    assert.equal(mayWriteBilling('stripe', 'app_store', tier), false);
    assert.equal(mayWriteBilling('stripe', 'play_store', tier), false);
  }
});

test('source rule: a store purchase wins over a live Stripe subscription', () => {
  for (const store of ['app_store', 'play_store'] as BillingSource[]) {
    for (const tier of ['trialing', 'active', 'past_due']) {
      assert.equal(mayWriteBilling(store, 'stripe', tier), true, `${store} on ${tier}`);
    }
    // ...and only that case is double billing.
    assert.equal(isDoubleBilling(store, 'stripe', 'active'), true);
    assert.equal(isDoubleBilling(store, 'stripe', 'canceled'), false);
    assert.equal(isDoubleBilling(store, 'app_store', 'active'), false);
    assert.equal(isDoubleBilling('stripe', 'stripe', 'active'), false);
  }
});

test('source rule: the filter encodes it in SQL, not in the caller', () => {
  const stripe = clausesFor('stripe');
  assert.ok(stripe.includes('billing_source.is.null'));
  assert.ok(stripe.includes('billing_source.eq.stripe'));
  assert.ok(stripe.includes('access_tier.not.in.(trialing,active,past_due)'));
  assert.ok(!stripe.includes('billing_source.eq.app_store'));
  // The store filter adds the Stipe override.
  for (const store of ['app_store', 'play_store']) {
    const clauses = clausesFor(store as BillingSource);
    assert.ok(clauses.includes(`billing_source.eq.${store}`));
    assert.ok(clauses.includes('billing_source.eq.stripe'), 'store may take over Stripe');
  }
});

// ── Wiring ────────────────────────────────────────────────────────────────

test('wiring: every Stripe billing write goes through the guarded writer', () => {
  // applySubscription's facts update and the deleted-case update both use the
  // guarded writer; no raw profile update with billing fields is left.
  assert.match(SYNC, /writeBillingFields\(supabase, write\)/);
  assert.doesNotMatch(SYNC, /\.update\(\{[\s\S]*profileFieldsFor/, 'no unguarded facts update');
  assert.doesNotMatch(WEBHOOK, /\.update\(\{\s*\n\s*subscription_status/, 'no unguarded deleted-case update');
  // The tier and plan writes keep the founder guard (inside the same UPDATE);
  // the billing-facts write passes false, so founders keep today's facts.
  assert.match(read('./billing-write.ts'), /access_tier\.is\.null,access_tier\.neq\.founder/);
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
