// design/tiers 01 (paywall page 3): how the wall is wired, from the source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const modal = read('src/components/PaywallModal.tsx');
const page = read('src/components/paywall/TiersPlanPage.tsx');

test('flag off: page 3 is today’s PlanStep and today’s footer', () => {
  assert.match(modal, /const tiersOn = NEXT_PUBLIC_TIERS;/);
  assert.match(modal, /\{current === 'plan' && tiersOn \? \(\n\s+<TiersPlanPage/);
  assert.match(modal, /\) : current === 'plan' \? \(\n\s+<div\n\s+ref=\{scrollRef\}/, 'today’s plan step stays for flag off');
  assert.match(modal, /\{!\(current === 'plan' && tiersOn\) && \(/, 'today’s footer only when the tiers page is not up');
  assert.match(modal, /: stepsFor\(variant, state, subscribable\);/, 'pages 1 and 2 untouched');
});

test('a Pro viewer lands straight on Move up to Plus (1B)', () => {
  assert.match(modal, /tiersOn && viewerPlan === 'pro' \? \(\['plan'\] as const\)\.slice\(\)/);
});

test('the page buys through purchases and waits on the server through confirm', () => {
  assert.match(page, /purchases\.upgrade\(\{ returnTo \}\)/);
  assert.match(page, /purchases\.start\(selected, \{ returnTo \}\)/);
  assert.match(page, /createPlanConfirmation\(\{[\s\S]*?expect: selected,/);
  assert.match(page, /if \(busyRef\.current \|\| !canBuy\(pay\)\) return;/, 'repeat taps never open a second store sheet');
  assert.doesNotMatch(page, /fetch\('\/api\/checkout'/, 'no second payment path');
});

test('every entry point opens this page with its entry', () => {
  assert.match(read('src/components/tabs/ChatView.tsx'), /<PaywallModal variant="invoice" entry="ai-limit"/);
  const host = read('src/components/tiers/TiersHost.tsx');
  assert.match(host, /const ENTRY: Record<PlanFeature, PaywallEntry> = \{ bank: 'bank', recurring: 'recurring', attachments: 'photos' \};/);
  assert.match(host, /entry=\{ENTRY\[paywall\]\}/);
  assert.match(read('src/components/tiers/PlanScreen.tsx'), /a\.kind === 'see-plans' \|\| a\.kind === 'upgrade'/);
});

test('no reminder toggle: the line uses TRIAL_REMINDER_DAYS', () => {
  assert.match(page, /reminderLine\(TRIAL_REMINDER_DAYS\)/);
  assert.doesNotMatch(page, /role="switch"|type="checkbox"/);
});

test('no price, plan name, trial length or cap typed in the page', () => {
  assert.doesNotMatch(page, /\$\d|['"](Pro|Plus|Free)['"]|\b14[- ]day|\bof (3|5)\b/);
});

test('board 04: a Pro user’s lock button buys from the sheet; Free opens the paywall with Plus', () => {
  const host = read('src/components/tiers/TiersHost.tsx');
  assert.match(host, /if \(request\.lock\.plan !== 'free'\) \{ void upgradeFromSheet\(\); return; \}\n\s+openPlanPaywall\(request\.lock\.feature\);/);
  assert.match(host, /let out = await purchases\.upgrade\(\{ returnTo: 'settings' \}\);/);
  assert.match(host, /createPlanConfirmation\(\{[^}]*expect: 'plus' \}\)/);
});

test('a Pro viewer drops an entry that sells Pro (no "Free includes" line on 1B)', () => {
  assert.match(page, /const target = rawTarget && \(viewerPlan !== 'pro' \|\| rawTarget\.plan === 'plus'\) \? rawTarget : null;/);
});
