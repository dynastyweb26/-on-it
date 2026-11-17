// design/tiers 04 (lock sheets) and 05 (photos skipped): the pure wording.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  includedChip,
  lockActions,
  lockPaywallReason,
  lockSheetCopy,
  photosSkippedCopy,
  showPhotosSkipped,
  skippedFromRow,
  usd,
} from './plan-lock-view';
import { PLAN_CATALOG } from './plan-catalog';
import { planLock } from './plan-lock';
import { formatDocNumber } from './documents';

const plus = PLAN_CATALOG.plans.find((p) => p.plan === 'plus')!;
const PLUS_PRICE = usd(plus.monthlyCents!);
const freeLock = planLock('bank', 'free', null)!;
const proLock = planLock('recurring', 'active', 'pro')!;

test('lock copy: the board’s three features', () => {
  assert.equal(lockSheetCopy('bank').title, 'Connect your bank');
  assert.equal(lockSheetCopy('recurring').title, 'Add a recurring expense');
  assert.match(lockSheetCopy('recurring').body, /The recurring expenses you already have keep running\.$/);
  assert.match(lockSheetCopy('attachments').body, /Photos already on your documents stay\.$/);
});

test('lock copy: the photo headline names the document it was opened from', () => {
  assert.equal(lockSheetCopy('attachments', 'estimate').title, 'Add photos to this estimate');
  assert.equal(lockSheetCopy('attachments', 'invoice').title, 'Add photos to this invoice');
  assert.doesNotMatch(JSON.stringify(['bank', 'recurring', 'attachments'].map((f) => lockSheetCopy(f as 'bank'))), /quote/i);
});

test('chip: plan and price from the catalog', () => {
  assert.equal(includedChip(freeLock, PLAN_CATALOG), `Included in ${plus.name} · ${PLUS_PRICE}/mo`);
  assert.equal(includedChip(freeLock, null), null);
});

test('actions: free with a trial is the trial button', () => {
  assert.deepEqual(lockActions(freeLock, PLAN_CATALOG, true), {
    primary: `Try ${plus.name} free for ${plus.trialDays} days`,
    note: null,
  });
});

test('actions: a returning free customer keeps the Subscribe wording', () => {
  assert.equal(lockActions(freeLock, PLAN_CATALOG, false)?.primary, `Subscribe — ${PLUS_PRICE}/month`);
});

test('actions: Pro is an upgrade with the proration line', () => {
  const a = lockActions(proLock, PLAN_CATALOG, false);
  assert.equal(a?.primary, `Upgrade to ${plus.name}`);
  assert.equal(a?.note, `You pay only the difference for the days left this month. ${plus.name} opens right away.`);
});

test('actions: no catalog, no buttons (never a made-up price)', () => {
  assert.equal(lockActions(freeLock, null, true), null);
});

test('paywall reason follows the drawn pattern', () => {
  assert.equal(lockPaywallReason('bank', 'Plus'), 'Connecting a bank is part of Plus.');
  assert.equal(lockPaywallReason('attachments', 'Plus'), 'Adding photos is part of Plus.');
});

test('photos notice: shown for a real skip, never to Plus', () => {
  const s = { count: 6, sourceDocNumber: 'E-0051' };
  assert.equal(showPhotosSkipped(s, 'pro'), true);
  assert.equal(showPhotosSkipped(s, 'free'), true);
  assert.equal(showPhotosSkipped(s, 'plus'), false);
  assert.equal(showPhotosSkipped({ count: 0, sourceDocNumber: null }, 'pro'), false);
  assert.equal(showPhotosSkipped(null, 'pro'), false);
});

test('photos notice: the board’s wording', () => {
  const c = photosSkippedCopy({ count: 6, sourceDocNumber: 'E-0051' }, 'Plus');
  assert.equal(c.toastTitle, 'Photos weren’t copied');
  assert.equal(c.toastBody, 'Adding photos is part of Plus. E-0051 keeps them.');
  assert.equal(c.inline, '6 photos stayed on E-0051. Adding photos is part of Plus.');
  assert.equal(c.link, 'See Plus');
});

test('photos notice: one photo, and a missing source number', () => {
  assert.equal(photosSkippedCopy({ count: 1, sourceDocNumber: 'E-0007' }, 'Plus').inline, '1 photo stayed on E-0007. Adding photos is part of Plus.');
  assert.match(photosSkippedCopy({ count: 2, sourceDocNumber: null }, 'Plus').inline, /^2 photos stayed on the original\./);
});

test('stored note: read off the row through the shared formatter', () => {
  const fmt = (n: number) => formatDocNumber('quote', n);
  assert.deepEqual(skippedFromRow({ attachments_skipped: 6, attachments_skipped_from: 51 }, fmt), { count: 6, sourceDocNumber: fmt(51) });
  assert.deepEqual(skippedFromRow({ attachments_skipped: 2, attachments_skipped_from: null }, fmt), { count: 2, sourceDocNumber: null });
  assert.equal(skippedFromRow({ attachments_skipped: null }, fmt), null);
  assert.equal(skippedFromRow({ attachments_skipped: 0 }, fmt), null);
  assert.equal(skippedFromRow(null, fmt), null);
});
