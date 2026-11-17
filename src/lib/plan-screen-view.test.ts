// design/tiers 06 (Settings › Plan): the pure wording, from planCard + catalog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planAction, planCardView, manageLabel, usageRows, shortDate, plansPaywallReason } from './plan-screen-view';
import { planCardFor } from './plan-card';
import { PLAN_CATALOG } from './plan-catalog';
import { usd } from './plan-lock-view';

const pro = PLAN_CATALOG.plans.find((p) => p.plan === 'pro')!;
const plus = PLAN_CATALOG.plans.find((p) => p.plan === 'plus')!;
const RENEW = '2026-12-15T12:00:00Z';
const TRIAL_END = '2026-11-29T12:00:00Z';

const free = planCardFor({ tier: 'free', plan: 'free' });
const proCard = planCardFor({ tier: 'active', plan: 'pro', currentPeriodEnd: RENEW });
const plusCard = planCardFor({ tier: 'active', plan: 'plus', currentPeriodEnd: RENEW, billingSource: 'app_store' });
const pending = planCardFor({ tier: 'active', plan: 'plus', currentPeriodEnd: RENEW, planChangeTo: 'pro', planChangeAt: RENEW });
const trial = planCardFor({ tier: 'trialing', plan: 'plus', trialEndsAt: TRIAL_END });
const founder = planCardFor({ tier: 'founder', plan: 'plus' });

test('6A free card: Pro from its catalog price, with the trial only when eligible', () => {
  assert.deepEqual(planCardView(free, PLAN_CATALOG, true), { kind: 'free', title: 'Free', sub: `${pro.name} from ${usd(pro.monthlyCents!)}/mo · ${pro.trialDays} days free` });
  assert.equal((planCardView(free, PLAN_CATALOG, false) as { sub: string }).sub, `${pro.name} from ${usd(pro.monthlyCents!)}/mo`);
});

test('6B paid card: price from planCard, renewal date', () => {
  assert.deepEqual(planCardView(proCard, PLAN_CATALOG, false), { kind: 'paid', title: 'Pro', price: usd(pro.monthlyCents!), sub: 'Renews Dec 15' });
});

test('6C every case: trial, pending downgrade, founder', () => {
  assert.deepEqual(planCardView(trial, PLAN_CATALOG, false), {
    kind: 'trial', title: 'Plus', sub: 'Free trial · ends Nov 29',
    // The reminder date is planCard's trialReminderAt (the real email), never computed here.
    then: `Then ${usd(plus.monthlyCents!)}/mo. Reminder on ${shortDate(trial.trialReminderAt)}.`,
  });
  assert.deepEqual(planCardView(pending, PLAN_CATALOG, false), { kind: 'pending', title: 'Plus until Dec 15, then Pro' });
  assert.deepEqual(planCardView(founder, PLAN_CATALOG, false), { kind: 'founder', title: 'Founder', sub: `${plus.name}, free forever` });
});

test('trial: the reminder line follows planCard, and a trial has no button (6C)', () => {
  assert.ok(trial.trialReminderAt, 'planCard sends the reminder date');
  assert.equal((planCardView({ ...trial, trialReminderAt: 'whatever' as string }, PLAN_CATALOG, false) as { then: string }).then,
    `Then ${usd(plus.monthlyCents!)}/mo.`, 'an unreadable date drops the clause, it is never worked out');
  assert.equal((planCardView({ ...trial, trialReminderAt: null }, PLAN_CATALOG, false) as { then: string }).then, `Then ${usd(plus.monthlyCents!)}/mo.`);
  assert.equal(planAction(trial, PLAN_CATALOG), null);
});

test('usage: free sees every cap; a full doc row says the next plan has none', () => {
  const rows = usageRows(free, { aiUsedToday: 3, aiLimit: 5, invoiceCount: 2, invoiceLimit: 3, estimateCount: 3, estimateLimit: 3, expenseCount: 4, expenseLimit: 5 }, PLAN_CATALOG);
  assert.deepEqual(rows.map((r) => [r.label, r.used, r.limit, r.pct, r.full, r.note]), [
    ['AI questions today', 3, 5, 60, false, 'Back to 5 at midnight'],
    ['Invoices', 2, 3, 66, false, null],
    ['Estimates', 3, 3, 100, true, `All used. ${pro.name} has no cap.`],
    ['Expenses', 4, 5, 80, false, null],
  ]);
});

test('usage: a paid plan sees only AI, with the no-cap line', () => {
  const rows = usageRows(proCard, { aiUsedToday: 12, aiLimit: 30, invoiceCount: 40, invoiceLimit: null }, PLAN_CATALOG);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].pct, 40);
  assert.equal(rows[0].note, 'Invoices, estimates and expenses have no cap on Pro.');
});

test('usage: a missing limit draws no row (never a made-up cap)', () => {
  assert.deepEqual(usageRows(free, {}, PLAN_CATALOG), []);
});

test('the one action, from what planCard allows', () => {
  assert.equal(planAction(free, PLAN_CATALOG)?.label, 'See plans');
  const up = planAction(proCard, PLAN_CATALOG);
  assert.equal(up?.kind, 'upgrade');
  assert.equal((up as { caption: string }).caption, `Bank, recurring, photos, ${plus.limits.aiDailyLimit} questions a day · ${usd(plus.monthlyCents!)}/mo`);
  assert.deepEqual(planAction(plusCard, PLAN_CATALOG), { kind: 'switch-pro', label: 'Switch to Pro', caption: 'Starts Dec 15. You keep your photos, recurring expenses and bank.' });
  assert.deepEqual(planAction(pending, PLAN_CATALOG), { kind: 'keep-plus', label: 'Keep Plus' });
  assert.equal(planAction(founder, PLAN_CATALOG), null, 'founder: no actions');
});

test('manage: the store name, none for the web portal or a founder', () => {
  assert.equal(manageLabel(plusCard), 'App Store');
  assert.equal(manageLabel(proCard), null);
  assert.equal(founder.manage, null);
});

test('dates and the paywall line', () => {
  assert.equal(shortDate(null), null);
  assert.equal(shortDate('nope'), null);
  assert.equal(plansPaywallReason(free), 'You’re on Free.');
});
