// The SQL gates' shape, read out of the migrations. The database can't run in a
// unit test, so these pin the parts that must never drift: the switch-off path
// is the old body exactly, the switch-on path asks is_plus(), the hints are the
// ones the client keys on, and each gate is as narrow as the spec says
// (INSERT only, no plan-alone, founder counts as Plus).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const RECURRING = read('../../supabase/migrations/20261116110000_tiers_recurring_gate.sql');

test('recurring: the switch-off branch is the old gate, hint included', () => {
  const off = RECURRING.slice(
    RECURRING.indexOf('if not public.tiers_enforced() then'),
    RECURRING.indexOf('if public.is_plus(NEW.user_id) then'),
  );
  assert.match(off, /select p\.access_tier into v_tier/);
  assert.match(off, /v_tier in \('founder', 'trialing', 'active', 'past_due'\)/);
  assert.match(off, /hint = 'PAYWALL_RECURRING'/);
  assert.doesNotMatch(off, /is_plus|PLAN_RECURRING/);
});

test('recurring: with tiers on, is_plus decides and Pro gets its own hint', () => {
  const on = RECURRING.slice(RECURRING.indexOf('if public.is_plus(NEW.user_id) then'));
  assert.match(on, /return NEW;/, 'a Plus user (and a founder) passes');
  assert.match(on, /hint = 'PLAN_RECURRING'/);
  assert.match(on, /hint = 'PAYWALL_RECURRING'/, 'free and canceled keep the paywall hint');
  assert.ok(
    on.indexOf("hint = 'PLAN_RECURRING'") < on.indexOf("hint = 'PAYWALL_RECURRING'"),
    'the Pro hint is the paid-but-not-Plus case, checked first',
  );
});

test('recurring: still BEFORE INSERT only, so existing items keep running', () => {
  assert.match(RECURRING, /before insert on public\.recurring_expenses/);
  assert.doesNotMatch(RECURRING, /before update|before delete|after insert|after update/);
  assert.match(
    RECURRING,
    /revoke execute on function public\.enforce_paid_recurring_expenses\(\) from public, anon, authenticated/,
  );
});

test('recurring: the trigger and function are re-asserted, not left to chance', () => {
  assert.match(RECURRING, /drop trigger if exists enforce_paid_recurring_expenses/);
  assert.match(RECURRING, /execute function public\.enforce_paid_recurring_expenses\(\)/);
});
