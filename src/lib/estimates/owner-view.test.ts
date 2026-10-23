import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateNumber,
  extendValidity,
  firstName,
  isOwnerEditable,
  itemCountLabel,
  lineItemMeta,
  ownerEstimateState,
  sentOrApprovedDate,
  signedMethodLabel,
  signedStamp,
  validityLabel,
} from './owner-view';

const CHI = 'America/Chicago';
const at = (iso: string) => new Date(iso);

test('owner state: draft is visible to the owner (unlike the public page)', () => {
  assert.equal(ownerEstimateState({ status: 'draft' }, at('2026-10-23T12:00:00Z'), CHI), 'draft');
  assert.equal(ownerEstimateState({ status: null }, at('2026-10-23T12:00:00Z'), CHI), 'draft');
});

test('owner state: approved beats converted, converted beats revoked', () => {
  const now = at('2026-10-23T12:00:00Z');
  assert.equal(
    ownerEstimateState({ status: 'sent', approvedAt: '2026-10-22T00:00:00Z', converted: true }, now, CHI),
    'approved',
  );
  assert.equal(ownerEstimateState({ status: 'sent', converted: true, revokedAt: 'x' }, now, CHI), 'converted');
  assert.equal(ownerEstimateState({ status: 'sent', revokedAt: '2026-10-22T00:00:00Z' }, now, CHI), 'revoked');
});

test('owner state: expired at local midnight after valid_until', () => {
  const row = { status: 'sent', validUntil: '2026-10-23' };
  assert.equal(ownerEstimateState(row, at('2026-10-24T04:59:59Z'), CHI), 'sent');
  assert.equal(ownerEstimateState(row, at('2026-10-24T05:00:00Z'), CHI), 'expired');
});

test('owner state: deleted is unavailable; only draft/sent are owner states', () => {
  const now = at('2026-10-23T12:00:00Z');
  assert.equal(ownerEstimateState({ status: 'sent', deletedAt: 'x' }, now, CHI), 'unavailable');
  assert.equal(ownerEstimateState({ status: 'void' }, now, CHI), 'unavailable');
});

test('editable until approved or converted', () => {
  assert.equal(isOwnerEditable('draft'), true);
  assert.equal(isOwnerEditable('sent'), true);
  assert.equal(isOwnerEditable('expired'), true);
  assert.equal(isOwnerEditable('approved'), false);
  assert.equal(isOwnerEditable('converted'), false);
  assert.equal(isOwnerEditable('revoked'), false);
});

test('estimate numbers are E-#### with the old four digits', () => {
  assert.equal(estimateNumber(17), 'E-0017');
  assert.equal(estimateNumber(1234), 'E-1234');
});

test('validity label follows the state', () => {
  assert.equal(validityLabel('sent', '2026-11-18'), 'Valid until Nov 18');
  assert.equal(validityLabel('expired', '2026-11-18'), 'Expired Nov 18');
  assert.equal(validityLabel('sent', null), null);
  assert.equal(validityLabel('approved', '2026-11-18'), null);
  assert.equal(validityLabel('converted', '2026-11-18'), null);
  assert.equal(validityLabel('revoked', '2026-11-18'), null);
});

test('signed card labels', () => {
  assert.equal(signedMethodLabel('draw'), 'Drawn, from estimate link');
  assert.equal(signedMethodLabel('type'), 'Typed, from estimate link');
  assert.equal(signedStamp('2026-10-23T03:42:00Z', 'UTC'), 'Oct 23, 2026 · 3:42 AM');
  assert.equal(sentOrApprovedDate('2026-10-23T03:42:00Z', 'UTC'), 'Oct 23');
});

test('first name for toasts', () => {
  assert.equal(firstName('Jordan Ellis'), 'Jordan');
  assert.equal(firstName('  '), 'your client');
  assert.equal(firstName(null), 'your client');
});

test('extend validity: 30 days from the later of today and the current expiry', () => {
  const now = at('2026-10-23T12:00:00Z');
  // Expired / none: today + 30.
  assert.equal(extendValidity('2026-10-01', now, CHI), '2026-11-22');
  assert.equal(extendValidity(null, now, CHI), '2026-11-22');
  // Still valid: current end + 30.
  assert.equal(extendValidity('2026-11-18', now, CHI), '2026-12-18');
  // Last valid day counts as still valid.
  assert.equal(extendValidity('2026-10-23', now, CHI), '2026-11-22');
});

test('item meta and count copy', () => {
  assert.equal(lineItemMeta({ qty: 3, unit: 'hour', unit_price: 85 }), '3 hour × $85.00');
  assert.equal(lineItemMeta({ qty: 1, unit_price: 100 }), '1 each × $100.00');
  assert.equal(itemCountLabel(1), '1 item');
  assert.equal(itemCountLabel(4), '4 items');
});
