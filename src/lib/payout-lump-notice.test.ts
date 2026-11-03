// The one-time payout notice: shown only when both exist, dismissible, and it
// must still render when storage throws.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LUMP_NOTICE_COPY, showLumpNotice, showLumpPopup } from './payout-lump-notice';
import { isPaidTier } from './paywall';

test('shown only when card payments and a bank are both connected', () => {
  assert.equal(showLumpNotice('acct_1', '4821'), true);
  assert.equal(showLumpNotice(null, '4821'), false, 'no Stripe account');
  assert.equal(showLumpNotice('acct_1', null), false, 'no bank');
  assert.equal(showLumpNotice('acct_1', ''), false);
  assert.equal(showLumpNotice(undefined, undefined), false);
});

test('the popup is paid-only even with both connections', () => {
  const paid = ['pro', 'founder', 'pro_monthly', 'pro_annual'].find((tier) => isPaidTier(tier));
  assert.ok(paid, 'the paywall still has a paid tier to test against');
  assert.equal(showLumpPopup(paid, 'acct_1', '4821'), true);
  assert.equal(showLumpPopup('free', 'acct_1', '4821'), false, 'free owners never see the popup');
  assert.equal(showLumpPopup(null, 'acct_1', '4821'), false);
  assert.equal(showLumpPopup(undefined, 'acct_1', '4821'), false);
  assert.equal(showLumpPopup(paid, null, '4821'), false, 'still needs Stripe');
  assert.equal(showLumpPopup(paid, 'acct_1', null), false, 'still needs a bank');
});

test('the copy is the exact sentence the design asks for', () => {
  assert.equal(
    LUMP_NOTICE_COPY,
    "Card payments pay out to your bank in one lump. We'll label those so they're never counted twice.",
  );
});

test('the component guards localStorage and still renders without it', () => {
  const source = readFileSync(
    join(process.cwd(), 'src', 'components', 'settings', 'PayoutLumpNotice.tsx'),
    'utf8',
  );
  // Both the read and the write are inside try/catch, and a failed read shows it.
  const reads = source.match(/localStorage\.getItem/g) ?? [];
  const writes = source.match(/localStorage\.setItem/g) ?? [];
  assert.equal(reads.length, 1);
  assert.equal(writes.length, 1);
  assert.match(source, /catch \{[\s\S]{0,160}dismissed = false;[\s\S]{0,40}\}/);
  assert.match(source, /catch \{[\s\S]{0,120}\}/);
  // Confirm-only: one button, no dismissable "don't show again" checkbox.
  assert.equal((source.match(/<button/g) ?? []).length, 1);
  assert.match(source, />\s*Got it\s*</);
  assert.match(source, /No profile column|no profile column/i);
});
