// ═══ Loading the real connection — the request plan ═══
// What GET /api/plaid/accounts answers, and the exact body Start tracking
// sends. The fetch lives in the screen; these are the rules around it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANK_POLL_MAX_TRIES, BANK_POLL_MS, accountsPlan, trackingBatch } from './bank-load';
import type { BankItemApi } from './bank-accounts';

const ITEM: BankItemApi = {
  id: 'item-row-1',
  institution_name: 'Chase',
  status: 'active',
  last_synced_at: '2026-11-01T10:00:00.000Z',
  accounts: [
    { id: 'a1', name: 'Business Checking', mask: '4821', type: 'depository', subtype: 'checking', track: true },
  ],
};

test('GET plan: 404 is the gate, a list is the item, junk is an error', () => {
  assert.equal(accountsPlan(404, { error: 'not found' }).kind, 'none');
  const ok = accountsPlan(200, { items: [ITEM, { nope: true }] });
  assert.equal(ok.kind, 'items');
  assert.equal(ok.kind === 'items' ? ok.items.length : -1, 1, 'malformed entries are dropped');
  assert.equal(accountsPlan(200, { items: [] }).kind, 'items');
  assert.equal(accountsPlan(500, { error: 'exchange_failed' }).kind, 'error');
  assert.equal(accountsPlan(200, { items: 'nope' }).kind, 'error');
  assert.equal(accountsPlan(200, null).kind, 'error');
});

test('start tracking is ONE batch, only the accounts turned on', () => {
  assert.deepEqual(trackingBatch('item-1', ['a1', 'a3']), {
    item_id: 'item-1',
    changes: [
      { account_id: 'a1', track: true },
      { account_id: 'a3', track: true },
    ],
  });
  assert.deepEqual(trackingBatch('item-1', []).changes, []);
});

test('a syncing item is re-read every 6s, at most 20 times', () => {
  assert.equal(BANK_POLL_MS, 6000);
  assert.equal(BANK_POLL_MAX_TRIES, 20);
});
