// ═══ Plaid Link pure rules ═══
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DUPLICATE_LINK_MESSAGE, isDuplicateLink, linkTokenRequest, trackPatch } from './link';

test('create mode asks for transactions only, US only, with the preview webhook', () => {
  const body = linkTokenRequest({ userId: 'user-1', webhookUrl: 'https://preview.example/api/plaid/webhook' });
  assert.deepEqual(body.products, ['transactions']);
  assert.deepEqual(body.country_codes, ['US']);
  assert.equal(body.webhook, 'https://preview.example/api/plaid/webhook');
  assert.deepEqual(body.user, { client_user_id: 'user-1' });
  assert.equal(body.access_token, undefined);
});

test('update mode sends the access token and no products/country codes', () => {
  const body = linkTokenRequest({
    userId: 'user-1',
    webhookUrl: 'https://preview.example/api/plaid/webhook',
    accessToken: 'access-sandbox-xxx',
  });
  assert.equal(body.access_token, 'access-sandbox-xxx');
  assert.equal(body.products, undefined);
  assert.equal(body.country_codes, undefined);
});

test('the same institution plus a shared mask is a duplicate', () => {
  const existing = [{ institutionId: 'ins_1', masks: ['1234', '9999'] }];
  assert.equal(isDuplicateLink({ institutionId: 'ins_1', masks: ['9999'] }, existing), true);
  assert.equal(isDuplicateLink({ institutionId: 'ins_2', masks: ['9999'] }, existing), false);
  assert.equal(isDuplicateLink({ institutionId: 'ins_1', masks: ['0000'] }, existing), false);
});

test('blank masks and an unknown institution never match', () => {
  const existing = [{ institutionId: null, masks: [null, ''] }, { institutionId: 'ins_1', masks: [''] }];
  assert.equal(isDuplicateLink({ institutionId: null, masks: ['1234'] }, existing), false);
  assert.equal(isDuplicateLink({ institutionId: 'ins_1', masks: [null, ' '] }, existing), false);
  assert.equal(isDuplicateLink({ institutionId: '', masks: ['1234'] }, existing), false);
});

test('the duplicate message is plain and mentions neither account numbers nor tokens', () => {
  assert.match(DUPLICATE_LINK_MESSAGE, /already linked/i);
  assert.doesNotMatch(DUPLICATE_LINK_MESSAGE, /\d{4}/);
});

test('tracking and tracked_at move together', () => {
  const on = trackPatch(true, '2026-10-31T12:00:00.000Z');
  assert.deepEqual(on, { track: true, tracked_at: '2026-10-31T12:00:00.000Z', updated_at: '2026-10-31T12:00:00.000Z' });
  const off = trackPatch(false, '2026-10-31T12:00:00.000Z');
  assert.deepEqual(off, { track: false, tracked_at: null, updated_at: '2026-10-31T12:00:00.000Z' });
});
