// ═══ Sync window + safe error text ═══
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncErrorText, syncWindowStart } from './sync-window';

const NOW = Date.parse('2026-10-31T12:00:00.000Z');

test('a fresh link stages from its link date', () => {
  assert.equal(syncWindowStart('2026-10-27T09:00:00.000Z', NOW), '2026-10-27');
});

test('an old link is capped at ~30 days, never the full history', () => {
  assert.equal(syncWindowStart('2026-01-01T00:00:00.000Z', NOW), '2026-10-01');
});

test('the cap and the link date meet exactly', () => {
  assert.equal(syncWindowStart('2026-10-01T00:00:00.000Z', NOW), '2026-10-01');
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
