// Funnel events: a no-op before PostHog starts, and labels are app enums only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { safeLabel, track } from './track';

test('track is a no-op (and never throws) before PostHog starts', () => {
  assert.doesNotThrow(() => track('subscription_started', {}));
});

test('safeLabel keeps enum-like names and drops free text', () => {
  assert.equal(safeLabel('invoice'), 'invoice');
  assert.equal(safeLabel('ai_limit'), 'ai_limit');
  assert.equal(safeLabel('Leonard Smith $500'), 'other');
  assert.equal(safeLabel(undefined), 'other');
});

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('each funnel step is wired where it happens', () => {
  assert.match(read('app/onboarding/page.tsx'), /track\('onboarding_completed', \{\}\)/);
  const chat = read('components/tabs/ChatView.tsx');
  assert.match(chat, /track\('document_created', \{ kind: rd0\.kind === 'quote' \? 'estimate' : 'invoice', source: 'chat' \}\)/);
  assert.match(chat, /track\('expense_recorded', \{ source: 'chat' \}\)/);
  assert.match(read('components/AddExpenseSheet.tsx'), /track\('expense_recorded', \{ source: 'sheet' \}\)/);
  assert.match(read('components/estimates/EstimateDetail.tsx'), /track\('document_created', \{ kind: 'invoice', source: 'estimate' \}\)/);
  assert.match(read('components/PaywallModal.tsx'), /track\('paywall_viewed'/);
  assert.match(read('components/PaywallModal.tsx'), /track\('checkout_started', \{ plan: 'pro', from: 'paywall' \}\)/);
  assert.match(read('components/paywall/TiersPlanPage.tsx'), /track\('checkout_started'/);
  assert.match(read('components/tiers/TiersHost.tsx'), /track\('checkout_started', \{ plan: 'plus', from: 'lock_sheet' \}\)/);
  assert.match(read('components/ProCelebration.tsx'), /track\('subscription_started', \{\}\)/);
});
