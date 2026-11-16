// /api/access gains the store-billing facts without changing anything it
// already returned (phase 5a, additive only).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROUTE = readFileSync(new URL('../../app/api/access/route.ts', import.meta.url), 'utf8');

test('access: the three store fields are returned', () => {
  assert.match(ROUTE, /billingSource: text\(billing\?\.billing_source\)/);
  assert.match(ROUTE, /planChangeTo: text\(billing\?\.plan_change_to\)/);
  assert.match(ROUTE, /planChangeAt: text\(billing\?\.plan_change_at\)/);
  // Still one object with every previous key spread in first.
  assert.match(ROUTE, /\.\.\.access,\n\s*trialEligible: trialEligible\(profile\),\n\s*subscriptionsEnabled: subscriptionsEnabled\(\),/);
});

test('access: the new columns are read in their own tolerant query', () => {
  assert.match(ROUTE, /select\('billing_source, plan_change_to, plan_change_at'\)/);
  // Not folded into the trial profile select, whose failure would change
  // trialEligible and subscriptionsEnabled on an un-migrated database.
  const trial = ROUTE.slice(ROUTE.indexOf("step('trialProfile'"), ROUTE.indexOf("step('billing'"));
  assert.doesNotMatch(trial, /billing_source/);
  // A missing value is null, never an exception or a made-up string.
  assert.match(ROUTE, /typeof value === 'string' \? value : null/);
});
