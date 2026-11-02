// ═══ GET /api/plaid/accounts — the payload, proven pure ═══
// The route reads through the session client; these checks pin what may leave
// the server. A column that is not in ITEMS_SELECT cannot be selected at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCOUNT_COLUMNS, ITEM_COLUMNS, ITEMS_SELECT, accountsResponse,
  type AccountsItemRow,
} from './accounts-view';

const ROW: AccountsItemRow = {
  id: 'item-row-1',
  institution_name: 'Chase',
  status: 'active',
  last_synced_at: '2026-11-01T10:00:00.000Z',
  plaid_accounts: [
    { id: 'a1', name: 'Business Checking', mask: '4821', type: 'depository', subtype: 'checking', track: true },
    { id: 'a2', name: '   ', mask: null, type: null, subtype: null, track: null },
  ],
};

test('the response shape is exactly what the screen reads', () => {
  assert.deepEqual(accountsResponse([ROW]), {
    items: [{
      id: 'item-row-1',
      institution_name: 'Chase',
      status: 'active',
      last_synced_at: '2026-11-01T10:00:00.000Z',
      accounts: [
        { id: 'a1', name: 'Business Checking', mask: '4821', type: 'depository', subtype: 'checking', track: true },
        { id: 'a2', name: 'Account', mask: null, type: null, subtype: null, track: false },
      ],
    }],
  });
});

test('a removed item never reaches the screen', () => {
  const removed = { ...ROW, id: 'gone', status: 'removed' };
  const { items } = accountsResponse([removed, ROW]);
  assert.deepEqual(items.map((item) => item.id), ['item-row-1']);
});

test('the select list names no secret column', () => {
  for (const column of ['access_token_enc', 'plaid_item_id', 'sync_cursor', 'last_sync_error', 'institution_id']) {
    assert.equal(ITEMS_SELECT.includes(column), false, `${column} must never be selected`);
  }
  assert.deepEqual([...ITEM_COLUMNS], ['id', 'institution_name', 'status', 'last_synced_at']);
  assert.deepEqual([...ACCOUNT_COLUMNS], ['id', 'name', 'mask', 'type', 'subtype', 'track']);
  assert.match(ITEMS_SELECT, /plaid_accounts\(id, name, mask, type, subtype, track\)$/);
});

test('no rows means an empty list, never a fabricated item', () => {
  assert.deepEqual(accountsResponse([]), { items: [] });
  assert.deepEqual(accountsResponse(null), { items: [] });
});
