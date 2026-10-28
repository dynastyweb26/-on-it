import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TRIAL_DAYS } from './trial';
import {
  PLAN_ROWS,
  PRICE_MONTHLY,
  REASON,
  STEP_TITLE,
  TRIAL_COPY,
  ctaLabel,
  disclosure,
  paywallState,
  planRows,
  stepsFor,
  type PaywallVariant,
} from './paywall-copy';

const VARIANTS: PaywallVariant[] = ['invoice', 'expense', 'estimate', 'recurring', 'reports', 'recaps', 'winback'];

test('the state follows the access answer and never guesses a trial', () => {
  assert.equal(paywallState(null), 'checking');
  assert.equal(paywallState(true), 'trial');
  assert.equal(paywallState(false), 'paid-today', 'an unreachable check reads as returning, as in PaywallModal');
});

test('the trial step appears only on a wall that can give a trial', () => {
  assert.deepEqual(stepsFor('invoice', 'trial'), ['showcase', 'trial', 'plan']);
  assert.deepEqual(stepsFor('invoice', 'paid-today'), ['showcase', 'plan']);
  // The winback wall never offers the trial, even if a stale check said it could.
  assert.deepEqual(stepsFor('winback', 'trial'), ['showcase', 'plan']);
  // While the check is in flight the promise stays; the CTA is disabled.
  assert.deepEqual(stepsFor('recurring', 'checking'), ['showcase', 'trial', 'plan']);

  // Subscriptions off (STRIPE_SUBSCRIPTIONS_ENABLED): nobody can start a trial,
  // so the trial step is not shown on any wall, in any state.
  for (const variant of VARIANTS) {
    for (const state of ['checking', 'trial', 'paid-today'] as const) {
      assert.deepEqual(stepsFor(variant, state, false), ['showcase', 'plan'], `${variant}/${state} off`);
    }
  }

  for (const variant of VARIANTS) {
    for (const state of ['checking', 'trial', 'paid-today'] as const) {
      const steps = stepsFor(variant, state);
      assert.equal(steps[0], 'showcase', `${variant}/${state} opens on the showcase`);
      assert.equal(steps[steps.length - 1], 'plan', `${variant}/${state} ends on the plan`);
      assert.equal(new Set(steps).size, steps.length, `${variant}/${state} has no duplicate step`);
      assert.equal(steps.includes('trial'), state !== 'paid-today' && variant !== 'winback');
    }
  }
});

test('only the trial state promises nothing is charged today', () => {
  assert.equal(ctaLabel('trial'), 'Start 14-day free trial');
  assert.equal(ctaLabel('paid-today'), 'Subscribe — $9.99/month');
  assert.equal(ctaLabel('checking'), 'Start 14-day free trial', 'disabled CTA keeps the trial label');

  const trial = disclosure('trial');
  assert.ok(trial.startsWith('Nothing charged today.'), trial);
  const dated = disclosure('trial', 'Nov 8, 2026');
  assert.ok(dated.startsWith('Free until Nov 8, 2026.'), dated);
  assert.match(dated, /renews monthly until you cancel/);
  assert.match(trial, /renews monthly until you cancel/);
  assert.match(trial, /Cancel anytime in Settings\./);
  assert.match(trial, /\$9\.99\/month/);

  const paid = disclosure('paid-today');
  assert.ok(paid.startsWith('$9.99/month starts today'), paid);
  assert.ok(!paid.includes('Nothing charged today'), 'a returning customer is charged today');
  assert.ok(!/free/i.test(paid), 'no free period is promised');
  assert.match(paid, /Cancel anytime in Settings\./);

  const checking = disclosure('checking');
  assert.equal(checking, 'Checking your plan…');
  assert.ok(!checking.includes('$'), 'no terms before the check answers');
});

test('the copy stays in step with lib/trial', () => {
  assert.ok(STEP_TITLE.trial.includes(String(TRIAL_DAYS)));
  assert.equal(STEP_TITLE.showcase, 'What you win');
  assert.equal(STEP_TITLE.plan, 'What’s included');

  assert.equal(TRIAL_COPY.todayAmount, '$0.00');
  assert.equal(TRIAL_COPY.startAmount, '$9.99/mo');
});

test('every wall has its own reason pill', () => {
  assert.deepEqual(Object.keys(REASON).sort(), [...VARIANTS].sort());
  assert.equal(REASON.expense, 'You’ve used your 5 free expenses');
  assert.equal(REASON.reports, 'Reports are part of On It Pro');
  assert.equal(REASON.recaps, 'You’ve used your 2 free recaps');
  assert.equal(REASON.winback, 'Welcome back — pick up where you left off');
  for (const variant of VARIANTS) assert.ok(REASON[variant].trim().length > 0, variant);
});

test('the plan table matches the caps the database enforces', () => {
  const on = planRows(true);
  const off = planRows(false);

  assert.equal(on.length, 8);
  assert.equal(off.length, 7);
  assert.ok(on.some((r) => r.label === 'Weekly & monthly recaps'));
  assert.ok(!off.some((r) => r.label === 'Weekly & monthly recaps'), 'the recaps row rides lib/recaps-live');

  assert.deepEqual(off.map((r) => r.label), [
    'Invoices',
    'Expenses & receipt scans',
    'Estimates',
    'Voice invoicing',
    'Online pay page',
    'Recurring expenses',
    'Income & expense reports (PDF)',
  ]);

  const row = (label: string) => {
    const found = PLAN_ROWS.find((r) => r.label === label);
    assert.ok(found, label);
    return found;
  };

  // Free caps: 3 invoices, 5 expenses, 3 estimates — free_*_limit().
  assert.equal(row('Invoices').free, '3 free');
  assert.equal(row('Invoices').paid, 'Unlimited');
  assert.equal(row('Expenses & receipt scans').free, '5 free');
  assert.equal(row('Expenses & receipt scans').paid, 'Unlimited');
  assert.equal(row('Estimates').free, '3 free');
  assert.equal(row('Estimates').paid, 'Unlimited');

  // Included on both tiers.
  assert.equal(row('Voice invoicing').free, true);
  assert.equal(row('Voice invoicing').paid, true);
  assert.equal(row('Online pay page').free, true);
  assert.equal(row('Online pay page').paid, true);

  // Paid only (recurring trigger + the PDF UI gate).
  assert.equal(row('Recurring expenses').free, false);
  assert.equal(row('Recurring expenses').paid, true);
  assert.equal(row('Income & expense reports (PDF)').free, false);
  assert.equal(row('Income & expense reports (PDF)').paid, true);
  // The free plan owns the first two weekly recaps (lib/recap/quota).
  assert.equal(row('Weekly & monthly recaps').free, '2 weekly');
  assert.equal(row('Weekly & monthly recaps').paid, true);
});

test('one tier only — no second price anywhere on the wall', () => {
  assert.equal(PRICE_MONTHLY, '$9.99');
  const words = [
    ...Object.values(REASON),
    ...Object.values(STEP_TITLE),
    ...Object.values(TRIAL_COPY),
    disclosure('trial'),
    disclosure('paid-today'),
    ...PLAN_ROWS.flatMap((r) => [r.label, String(r.free), String(r.paid)]),
  ].join(' | ');

  assert.ok(!words.includes('$15'), words);
  assert.ok(!words.includes('$30'), words);
  assert.ok(!/per year|\/year|annual/i.test(words), words);
  assert.match(disclosure('trial'), /9\.99/);
  assert.match(disclosure('paid-today'), /9\.99/);
});
