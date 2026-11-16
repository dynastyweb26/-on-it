// TIERS-SPEC.md rule 3: a lock names the plan that opens it. One typed shape for
// the three Plus-only features (bank, recurring, attachments), so no screen
// matches an error string, and the routes behind NEXT_PUBLIC_TIERS answer it
// only when the gate refuses (flag off = today).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LOCK_CODES,
  PLAN_FEATURES,
  PLAN_REQUIRED,
  PLAN_REQUIRED_BY,
  isLockCode,
  isPlanRefusalBody,
  planLock,
  planLockBody,
  planLockFrom,
  planLockFromCode,
} from './plan-lock';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('lock: every Plus-only feature, and only those three', () => {
  assert.deepEqual(PLAN_FEATURES, ['bank', 'recurring', 'attachments']);
  for (const feature of PLAN_FEATURES) {
    assert.equal(PLAN_REQUIRED_BY[feature], 'plus', feature);
    assert.deepEqual(planLockBody(feature), {
      error: 'plan_required',
      feature,
      planRequired: 'plus',
    });
  }
});

test('lock: free and Pro get the full shape, with the plan they are on', () => {
  assert.deepEqual(planLock('bank', 'free', null), {
    error: 'plan_required',
    feature: 'bank',
    planRequired: 'plus',
    plan: 'free',
  });
  assert.deepEqual(planLock('recurring', 'trialing', null), {
    error: 'plan_required',
    feature: 'recurring',
    planRequired: 'plus',
    plan: 'pro',
  });
  assert.deepEqual(planLock('attachments', 'canceled', 'plus'), {
    error: 'plan_required',
    feature: 'attachments',
    planRequired: 'plus',
    plan: 'free',
  });
});

test('lock: a Plus plan and a founder are never locked', () => {
  assert.equal(planLock('bank', 'active', 'plus'), null);
  assert.equal(planLock('recurring', 'founder', null), null);
  assert.equal(planLock('attachments', 'past_due', 'plus'), null);
});

test('lock body: the stable code and the gate codes the app can raise', () => {
  assert.equal(PLAN_REQUIRED, 'plan_required');
  assert.deepEqual(LOCK_CODES, [
    'plan_required',
    'PLAN_RECURRING',
    'PAYWALL_RECURRING',
    'PLAN_ATTACHMENTS',
  ]);
  for (const code of LOCK_CODES) assert.equal(isLockCode(code), true, code);
  for (const code of [null, undefined, '', 'PAYWALL_LIMIT', 'locked']) {
    assert.equal(isLockCode(code), false, String(code));
  }
});

test('lock body: a refusal is recognised, anything else is not', () => {
  assert.equal(isPlanRefusalBody({ error: 'plan_required' }), true);
  assert.equal(isPlanRefusalBody({ error: 'plan_required', feature: 'bank' }), true);
  assert.equal(isPlanRefusalBody({ code: 'plan_required' }), true);
  assert.equal(isPlanRefusalBody({ error: 'plan_required_ish' }), false);
  assert.equal(isPlanRefusalBody({ error: 'rate_limited' }), false);
  assert.equal(isPlanRefusalBody(null), false);
  assert.equal(isPlanRefusalBody('plan_required'), false);
});

test('lock: the client completes it with the plan it already holds', () => {
  assert.deepEqual(planLockFrom('bank', { error: 'plan_required' }, 'pro'), {
    error: 'plan_required',
    feature: 'bank',
    planRequired: 'plus',
    plan: 'pro',
  });
  // The feature is the call site's: a body cannot claim another feature.
  assert.equal(planLockFrom('bank', { error: 'plan_required', feature: 'attachments' }, 'free')?.feature, 'bank');
  assert.equal(planLockFrom('bank', { error: 'unauthorized' }, 'free'), null);
  assert.equal(planLockFrom('bank', null, 'free'), null);
});

test('lock: a SQL hint or thrown code becomes the same typed result', () => {
  assert.deepEqual(planLockFromCode('recurring', 'PLAN_RECURRING', 'pro'), {
    error: 'plan_required',
    feature: 'recurring',
    planRequired: 'plus',
    plan: 'pro',
  });
  assert.equal(planLockFromCode('recurring', 'PAYWALL_RECURRING', 'free')?.plan, 'free');
  assert.equal(planLockFromCode('attachments', 'PLAN_ATTACHMENTS', 'free')?.feature, 'attachments');
  assert.equal(planLockFromCode('attachments', 'plan_required', 'free')?.feature, 'attachments');
  assert.equal(planLockFromCode('attachments', 'confirm_failed', 'free'), null);
  assert.equal(planLockFromCode('attachments', undefined, 'free'), null);
});

// ── Wiring: the routes answer the typed half, and only behind the flag ──────

test('wiring: the bank gate answers the typed lock body', () => {
  const LINK = read('../app/api/plaid/link-token/route.ts');
  const EXCHANGE = read('../app/api/plaid/exchange/route.ts');
  // The gate expression itself is untouched, so flag off is today's route.
  assert.match(
    LINK,
    /if \(!parsed\.data\.item_id && !\(await newPlaidLinkAllowed\(supabase, user\.id, NEXT_PUBLIC_TIERS\)\)\) \{/,
  );
  assert.match(LINK, /fail\('link-token', 'plan_required', null, planLockBody\('bank'\)\)/);
  assert.match(EXCHANGE, /fail\('exchange', 'plan_required', null, planLockBody\('bank'\)\)/);
});

test('wiring: the attachment routes answer the typed lock body', () => {
  for (const path of [
    '../app/api/estimates/[id]/attachments/presign/route.ts',
    '../app/api/estimates/[id]/attachments/confirm/route.ts',
  ]) {
    const source = read(path);
    assert.match(source, /planLockBody\('attachments'\)/, path);
    // The refusal itself is unchanged: only the body gained the typed fields.
    assert.match(source, /refuse\(403, 'plan_required'\)/, path);
  }
});

test('wiring: the client helpers return the typed lock, not a thrown string', () => {
  const INVOICE = read('./attachments-client.ts');
  assert.match(INVOICE, /export function attachmentPlanLock\(/);
  assert.match(INVOICE, /planLockFromCode\('attachments', PLAN_ATTACHMENTS, currentPlan\)/);
  const ESTIMATE = read('./estimates/attachments-client.ts');
  assert.match(ESTIMATE, /export function estimateAttachmentPlanLock\(/);
  assert.match(ESTIMATE, /planLockFromCode\('attachments', e instanceof Error \? e\.message : null, currentPlan\)/);
});

test('wiring: nothing outside the three gates grew a plan check', () => {
  for (const path of [
    '../app/api/plaid/sync/route.ts',
    '../app/api/plaid/review/route.ts',
    '../app/api/plaid/transactions/route.ts',
    '../app/api/plaid/deposits/route.ts',
    '../app/api/plaid/disconnect/route.ts',
    '../app/api/plaid/webhook/route.ts',
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /planLockBody|PLAN_REQUIRED/, path);
  }
});
