// ═══ Sync window + safe error text ═══
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backfillDays, syncErrorText, syncWindowStart } from './sync-window';

const NOW = Date.parse('2026-10-31T12:00:00.000Z');
// Explicit env: the window must not depend on the machine that runs the tests.
const NO_BACKFILL = {};

test('a fresh link stages from its link date', () => {
  assert.equal(syncWindowStart('2026-10-27T09:00:00.000Z', NOW, NO_BACKFILL), '2026-10-27');
});

test('an old link is capped at ~30 days, never the full history', () => {
  assert.equal(syncWindowStart('2026-01-01T00:00:00.000Z', NOW, NO_BACKFILL), '2026-10-01');
});

test('the cap and the link date meet exactly', () => {
  assert.equal(syncWindowStart('2026-10-01T00:00:00.000Z', NOW, NO_BACKFILL), '2026-10-01');
});

test('PLAID_BACKFILL_DAYS reaches before the link date', () => {
  assert.equal(
    syncWindowStart('2026-10-27T09:00:00.000Z', NOW, { PLAID_BACKFILL_DAYS: '7' }),
    '2026-10-20',
  );
  assert.equal(
    syncWindowStart('2026-10-27T09:00:00.000Z', NOW, { PLAID_BACKFILL_DAYS: '0' }),
    '2026-10-27',
  );
});

test('the 30 day staging cap still wins over a wide backfill', () => {
  // 27 Oct − 45d = 12 Sep, but the cap is 1 Oct.
  assert.equal(
    syncWindowStart('2026-10-27T09:00:00.000Z', NOW, { PLAID_BACKFILL_DAYS: '45' }),
    '2026-10-01',
  );
});

test('junk backfill values fall back to 0, never to a wider window', () => {
  assert.equal(backfillDays(undefined), 0);
  assert.equal(backfillDays(''), 0);
  assert.equal(backfillDays('   '), 0);
  assert.equal(backfillDays('abc'), 0);
  assert.equal(backfillDays('-7'), 0);
  assert.equal(backfillDays('7.5'), 0);
  assert.equal(backfillDays('1e3'), 0);
  assert.equal(backfillDays(' 7 '), 7);
  for (const junk of ['', 'abc', '-7', '7.5']) {
    assert.equal(
      syncWindowStart('2026-10-27T09:00:00.000Z', NOW, { PLAID_BACKFILL_DAYS: junk }),
      '2026-10-27',
      `${junk || 'empty'} stages from the link date`,
    );
  }
});

test('backfill is clamped to 90 days', () => {
  assert.equal(backfillDays('90'), 90);
  assert.equal(backfillDays('91'), 90);
  assert.equal(backfillDays('1000'), 90);
  const capped = syncWindowStart('2026-10-27T09:00:00.000Z', NOW, { PLAID_BACKFILL_DAYS: '90' });
  const past = syncWindowStart('2026-10-27T09:00:00.000Z', NOW, { PLAID_BACKFILL_DAYS: '500' });
  assert.equal(capped, past, 'anything above the clamp is the clamp');
  assert.equal(capped, '2026-10-01', 'the 30 day cap still applies at the clamp');
});

test('error text keeps the Plaid code and is capped at 400 chars', () => {
  assert.equal(syncErrorText({ error_code: 'ITEM_LOGIN_REQUIRED' }), 'ITEM_LOGIN_REQUIRED');
  assert.equal(
    syncErrorText({ error_code: 'RATE_LIMIT_EXCEEDED', message: 'slow down' }),
    'RATE_LIMIT_EXCEEDED: slow down',
  );
  assert.equal(syncErrorText({ error_type: 'API_ERROR' }), 'API_ERROR');
  assert.equal(syncErrorText(new Error('boom')), 'sync_failed: boom');
  assert.equal(syncErrorText(null), 'sync_failed');
  assert.equal(syncErrorText({ message: 'x'.repeat(1000) }).length, 400);
});

test('error text never echoes an access token field', () => {
  const text = syncErrorText({
    error_code: 'INVALID_ACCESS_TOKEN',
    access_token: 'access-sandbox-secret',
    message: 'invalid access token',
  });
  assert.doesNotMatch(text, /access-sandbox-secret/);
  assert.equal(text, 'INVALID_ACCESS_TOKEN: invalid access token');
});
