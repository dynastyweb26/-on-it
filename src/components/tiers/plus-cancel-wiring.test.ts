// design/tiers 07 (cancel flow, two-plan additions): how the screen is wired.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const screen = read('src/app/(app)/settings/plan/cancel/CancelScreen.tsx');
const step = read('src/components/tiers/PlusCancel.tsx');

test('only a Plus user (flag on) gets the additions; Pro and Free keep today’s single offer', () => {
  assert.match(screen, /if \(NEXT_PUBLIC_TIERS\) \{/);
  assert.match(screen, /if \(d && d\.card\.plan === 'plus' && !d\.card\.founder\) \{/);
  assert.match(screen, /: offerFor\(reason, summary\.status \?\? '', Boolean\(summary\.offerEligible\)\);/, 'today’s offer for everyone else');
});

test('offers come from cancelOffersFor', () => {
  assert.match(screen, /cancelOffersFor\(\{ plan: 'plus', reason, trialing, billingSource: plusCtx\.billingSource, eligible: Boolean\(summary\.offerEligible\) \}\)/);
});

test('Switch to Pro goes through purchases.switchToPro, then records the offer (switch_pro) only once it worked', () => {
  const fn = screen.slice(screen.indexOf('async function switchToPro()'), screen.indexOf('async function takePlus'));
  const sw = fn.indexOf('purchases.switchToPro()');
  const rec = fn.indexOf('recordSwitchToPro()');
  assert.ok(sw > 0 && rec > sw, 'switch first, record after');
  assert.match(fn, /if \(out\.status === 'failed'\) throw new Error\(out\.message\);/);
  assert.match(read('src/lib/subscription-actions.ts'), /post<\{ kind: 'switch_pro' \}>\('\/api\/subscription\/offer', \{ kind: 'switch_pro' \}\)/);
});

test('the 7A step: pending freezes the cards and disables Cancel anyway; a ref ignores repeat taps', () => {
  assert.match(step, /if \(busy\.current \|\| pending \|\| state === 'success'\) return;/);
  assert.match(step, /className=\{`pc-cards\$\{pending \? ' is-frozen' : ''\}`\}/);
  assert.match(step, /className="pc-later" onClick=\{onCancelAnyway\} disabled=\{pending\}/);
});

test('no price or plan name typed in the step (the 50% price is the catalog’s)', () => {
  assert.doesNotMatch(step, /\$\d|['"](Pro|Plus)['"]|\b(50|8\.49|16\.99)\b/);
});

test('web, store-billed Plus: 7A shows no offers and no Switch to Pro, only where to manage it; 7B too', () => {
  assert.match(screen, /const storeManage = plusCtx \? storeManageFor\(plusCtx\.billingSource, purchases\.source === 'native', plusCtx\.catalog\) : null;/);
  assert.match(screen, /storeManage=\{storeManage\}/);
  assert.match(screen, /\{storeManage \? <StoreManageCard manage=\{storeManage\} \/> : \(/);
  const branch = step.slice(step.indexOf('if (storeManage) {'), step.indexOf('return (\n    <div className="pc-step" data-plus-cancel={state}>'));
  assert.ok(branch.length > 0);
  assert.doesNotMatch(branch, /pc-cards|plusOfferCta|onTake/, 'no offer cards, no CTA in the store branch');
});
