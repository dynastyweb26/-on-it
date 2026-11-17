// design/tiers 06 (Settings › Plan): how the screen is wired, from the source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planScreenData } from '@/lib/plan-screen-view';
import { planCardFor } from '@/lib/plan-card';
import { PLAN_CATALOG } from '@/lib/plan-catalog';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const settings = read('src/app/(app)/settings/SettingsView.tsx');
const screen = read('src/components/tiers/PlanScreen.tsx');

test('flag off, past due, canceling and paused keep today’s screens', () => {
  assert.match(settings, /const tiersPlan = NEXT_PUBLIC_TIERS && Boolean\(p\) && !planPaused && !planCanceling && planTier !== 'past_due';/);
  assert.match(settings, /const legacyPlan = !NEXT_PUBLIC_TIERS \|\| \(Boolean\(p\) && !tiersPlan\);/);
  assert.match(settings, /\{is\('plan'\) && tiersPlan && \(\n\s+<PlanScreen/);
  assert.match(settings, /\{is\('plan'\) && legacyPlan && planTier === 'founder' && \(/);
  assert.match(settings, /\{is\('plan'\) && legacyPlan && planTier !== 'founder' && \(PAYWALL_ENABLED \|\| planLive\) && \(/);
});

test('the cancel flow keeps its entry from Plan for a paid plan', () => {
  assert.match(settings, /card\.plan !== 'free' && !card\.founder \? \(\n\s+<button className="btn-outline[^"]*" onClick=\{\(\) => router\.push\('\/settings\/plan\/cancel'\)\}>/);
});

test('every plan action goes through the one purchase interface', () => {
  for (const call of ['purchases.upgrade(', 'purchases.switchToPro()', 'purchases.keepPlus()', 'purchases.restore()', 'purchases.manage()']) {
    assert.ok(screen.includes(call), call);
  }
  assert.doesNotMatch(screen, /fetch\('\/api\/(checkout|billing-portal)/, 'no second payment path');
});

test('the screen computes no plan fact: no price, plan name or limit typed', () => {
  // Style sizes are the board's own (a 5px radius, 100% width); a limit would
  // read as copy: "of 5", "30 a day", "100 questions".
  assert.doesNotMatch(screen, /\$\d|['"](Pro|Plus|Free|Founder)['"]|\bof (5|30|100)\b|\b(5|30|100) (questions|a day)/);
});

test('planScreenData reads planCard as the server sent it, and nothing without it', () => {
  const card = planCardFor({ tier: 'active', plan: 'pro', currentPeriodEnd: '2026-12-15T12:00:00Z' });
  const d = planScreenData({ planCard: card, planCatalog: PLAN_CATALOG, trialEligible: false, aiUsedToday: 12, aiLimit: 30, invoiceLimit: null });
  assert.equal(d?.card, card);
  assert.equal(d?.usage.aiUsedToday, 12);
  assert.equal(d?.usage.invoiceLimit, null);
  assert.equal(planScreenData({ tier: 'active' }), null, 'flag-off body: no plan card, no screen');
  assert.equal(planScreenData(null), null);
});
