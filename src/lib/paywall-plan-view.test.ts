// design/tiers 01 (paywall page 3): the pure wording and states.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canBuy, ctaFor, headline, payStateFor, pickerFrozen, planCards, plusAdds, plusAddsTitle,
  reminderLine, tableRows, topLineFor, entryForVariant, freeCapsFrom, preselectFor,
} from './paywall-plan-view';
import { PLAN_CATALOG } from './plan-catalog';
import { paywallEntryFor } from './paywall-entry';
import { TRIAL_REMINDER_DAYS } from './trial';
import { usd } from './plan-lock-view';

const pro = PLAN_CATALOG.plans.find((p) => p.plan === 'pro')!;
const plus = PLAN_CATALOG.plans.find((p) => p.plan === 'plus')!;
const CAPS = { invoices: 3, estimates: 3, expenses: 5, ai: 5 };

test('top line: the entry map’s key, worded as the board draws it', () => {
  assert.deepEqual(topLineFor(paywallEntryFor('invoice', 'free')!.topLineKey, PLAN_CATALOG, CAPS), { icon: 'description', text: 'Free includes 3 invoices. You’ve used them.' });
  assert.deepEqual(topLineFor(paywallEntryFor('bank', 'free')!.topLineKey, PLAN_CATALOG, CAPS), { icon: 'account_balance', text: 'Connecting a bank is part of Plus.' });
  assert.equal(topLineFor(paywallEntryFor('bank', 'pro')!.topLineKey, PLAN_CATALOG, CAPS)?.text, 'Connecting a bank is part of Plus.');
  assert.equal(topLineFor('limit.invoice', PLAN_CATALOG, { ...CAPS, invoices: null })?.text, 'You’ve used your free invoices.');
  assert.equal(topLineFor(null, PLAN_CATALOG, CAPS), null);
});

test('preselect: a free limit is Pro, a Plus lock is Plus (the entry map decides)', () => {
  assert.equal(paywallEntryFor('invoice', 'free')?.plan, 'pro');
  assert.equal(paywallEntryFor('photos', 'free')?.plan, 'plus');
});

test('plan cards: names, prices and the trial chip from the catalog', () => {
  const cards = planCards(PLAN_CATALOG, true);
  assert.deepEqual(cards.map((c) => [c.plan, c.name, c.price, c.chip]), [
    ['pro', pro.name, usd(pro.monthlyCents!), `${pro.trialDays}-day free trial`],
    ['plus', plus.name, usd(plus.monthlyCents!), `${plus.trialDays}-day free trial`],
  ]);
  assert.equal(planCards(PLAN_CATALOG, false)[0].chip, null, 'a returning customer has no trial chip');
  assert.deepEqual(planCards(null, true), []);
});

test('headline: Pick your plan for Free, Move up to Plus for Pro (1B)', () => {
  assert.deepEqual(headline('free', PLAN_CATALOG, true), { title: 'Pick your plan', sub: `Both start with ${pro.trialDays} days free.` });
  assert.deepEqual(headline('free', PLAN_CATALOG, false), { title: 'Pick your plan', sub: null });
  assert.deepEqual(headline('pro', PLAN_CATALOG, false), { title: 'Move up to Plus', sub: null });
});

test('1B: what Plus adds, with the AI numbers from the catalog', () => {
  assert.equal(plusAddsTitle(PLAN_CATALOG), 'WHAT PLUS ADDS TO PRO');
  assert.deepEqual(plusAdds(PLAN_CATALOG).at(-1), { icon: 'forum', label: 'AI questions a day', from: String(pro.limits.aiDailyLimit), to: String(plus.limits.aiDailyLimit) });
});

test('table: the board’s labels and cells, free caps from access, no Voice row', () => {
  const rows = tableRows(PLAN_CATALOG, CAPS);
  assert.equal(rows.length, 9);
  assert.ok(!rows.some((r) => /\bvoice\b/i.test(r.label)), 'no Voice invoicing row (RULES 3)');
  const inv = rows.find((r) => r.key === 'invoices')!;
  assert.deepEqual([inv.free, inv.pro], [{ kind: 'text', text: '3' }, { kind: 'icon', icon: 'all_inclusive', label: 'No cap' }]);
  const recaps = rows.find((r) => r.key === 'recaps')!;
  assert.deepEqual([recaps.free, recaps.pro], [{ kind: 'text', text: '2 weekly' }, { kind: 'text', text: 'All' }]);
  const bank = rows.find((r) => r.key === 'bank')!;
  assert.deepEqual([bank.pro.kind === 'icon' && bank.pro.icon, bank.plus.kind === 'icon' && bank.plus.icon], ['remove', 'check']);
  assert.equal(rows.find((r) => r.key === 'attachments')!.label, 'Photos on invoices & estimates');
  assert.deepEqual(tableRows(PLAN_CATALOG, { ...CAPS, invoices: null }).find((r) => r.key === 'invoices')!.free, { kind: 'text', text: 'Limited' });
});

test('reminder line uses the real lead time', () => {
  assert.equal(reminderLine(TRIAL_REMINDER_DAYS), `We’ll remind you ${TRIAL_REMINDER_DAYS} days before your trial ends.`);
});

test('CTA: trial, returning Subscribe wording, Pro upgrade; store words only native', () => {
  const trial = ctaFor({ viewerPlan: 'free', selected: 'pro', catalog: PLAN_CATALOG, trialEligible: true, native: false, freeUntil: 'Dec 1' })!;
  assert.equal(trial.label, `Start ${pro.trialDays}-day free trial`);
  assert.equal(trial.sub, `then ${usd(pro.monthlyCents!)} / month, cancel anytime`);
  assert.doesNotMatch(trial.legal + trial.renews, /App Store/);
  const native = ctaFor({ viewerPlan: 'free', selected: 'plus', catalog: PLAN_CATALOG, trialEligible: true, native: true })!;
  assert.match(native.legal, /App Store/);
  assert.equal(native.sub, `then ${usd(plus.monthlyCents!)} / month, cancel anytime`);
  assert.equal(ctaFor({ viewerPlan: 'free', selected: 'pro', catalog: PLAN_CATALOG, trialEligible: false, native: false })!.label, `Subscribe — ${usd(pro.monthlyCents!)}/month`);
  const up = ctaFor({ viewerPlan: 'pro', selected: 'plus', catalog: PLAN_CATALOG, trialEligible: false, native: false })!;
  assert.equal(up.label, 'Upgrade to Plus');
  assert.equal(up.sub, 'You pay only the difference for the days left this month. Plus opens right away.');
  assert.equal(ctaFor({ viewerPlan: 'free', selected: 'pro', catalog: null, trialEligible: true, native: false }), null);
});

test('pay states: cancelled is idle, repeat taps only from idle or failed, picker frozen in flight', () => {
  assert.equal(payStateFor({ status: 'cancelled' }), 'idle');
  assert.equal(payStateFor({ status: 'failed', cause: 'store_only', message: 'x' }), 'failed');
  assert.equal(payStateFor({ status: 'success', plan: 'pro' }), 'success');
  assert.deepEqual(['idle', 'pending', 'confirming', 'slow', 'failed', 'success'].map((s) => canBuy(s as 'idle')), [true, false, false, false, true, false]);
  assert.deepEqual(['idle', 'pending', 'confirming', 'slow', 'failed'].map((s) => pickerFrozen(s as 'idle')), [false, true, true, true, false]);
});

test('variant → entry for callers that pass only a variant', () => {
  assert.equal(entryForVariant('reports'), 'pdfs');
  assert.equal(entryForVariant('nope'), null);
});

test('free caps come from the catalog, so a Pro viewer’s Free column shows the real caps', () => {
  const caps = freeCapsFrom(PLAN_CATALOG, 'pro');
  assert.deepEqual([caps.invoices, caps.estimates, caps.expenses], [PLAN_CATALOG.freeCaps.invoices, PLAN_CATALOG.freeCaps.estimates, PLAN_CATALOG.freeCaps.expenses]);
  assert.equal(caps.ai, pro.limits.aiDailyLimit, 'the AI line names the viewer’s own plan limit');
  const inv = tableRows(PLAN_CATALOG, caps).find((r) => r.key === 'invoices')!;
  assert.deepEqual(inv.free, { kind: 'text', text: String(PLAN_CATALOG.freeCaps.invoices) });
});

test('a Pro viewer never gets a Free-limit line: only a Plus entry speaks to them (1B)', () => {
  // The rule TiersPlanPage applies: a target that sells Pro is dropped for Pro.
  const forPro = (e: Parameters<typeof paywallEntryFor>[0]) => {
    const t = paywallEntryFor(e, 'pro');
    return t && t.plan === 'plus' ? t : null;
  };
  assert.equal(forPro('invoice'), null);
  assert.equal(topLineFor(forPro('invoice')?.topLineKey, PLAN_CATALOG, freeCapsFrom(PLAN_CATALOG, 'pro')), null);
  assert.equal(topLineFor(forPro('bank')?.topLineKey, PLAN_CATALOG, freeCapsFrom(PLAN_CATALOG, 'pro'))?.text, 'Connecting a bank is part of Plus.');
  assert.match(topLineFor(forPro('ai-limit')?.topLineKey, PLAN_CATALOG, freeCapsFrom(PLAN_CATALOG, 'pro'))?.text ?? '', /^Pro includes 30 AI questions a day/);
});

test('first open (a free limit): Plus preselected on native, Pro on the web; every other entry unchanged', () => {
  const t = (e: Parameters<typeof paywallEntryFor>[0], v: 'free' | 'pro' = 'free') => paywallEntryFor(e, v);
  for (const e of ['invoice', 'estimate', 'expense'] as const) {
    assert.equal(preselectFor(t(e), 'free', true), 'plus', e + ' native');
    assert.equal(preselectFor(t(e), 'free', false), 'pro', e + ' web');
  }
  // Lock sheets / photos: Plus; AI limit card (See Pro): Pro; Settings (no entry): Pro, on both builds.
  for (const native of [true, false]) {
    assert.equal(preselectFor(t('bank'), 'free', native), 'plus');
    assert.equal(preselectFor(t('photos'), 'free', native), 'plus');
    assert.equal(preselectFor(t('ai-limit'), 'free', native), 'pro');
    assert.equal(preselectFor(null, 'free', native), 'pro');
    assert.equal(preselectFor(t('pdfs'), 'free', native), 'pro');
    assert.equal(preselectFor(t('invoice', 'pro'), 'pro', native), 'plus', 'a Pro viewer is only sold Plus');
  }
});
