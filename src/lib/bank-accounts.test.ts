// ═══ Bank accounts, phase 1: fixture rules ═══
// Pure checks for the Settings row, the tier fixture toggle, the status copy
// and the digest time. The write guarantee lives in bank-tracking.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BANK_DIGEST_DEFAULT, DIGEST_OPTIONS, ACCOUNT_STATUS_COPY,
  bankConnectionStatus, bankKind, bankPreviewState, bankRowTitle, bankRowValue,
  bankTierFromSearch, connectionFromItems, digestLabel, digestSentence,
  emptyConnection, initialConnectionFromSearch, isLinked, itemToConnection, linkedConnection,
  trackedAccounts, trackedCount, type BankItemApi,
} from './bank-accounts';

test('the pitch is the default; the fixture can jump to a frozen state', () => {
  assert.equal(initialConnectionFromSearch('').status, 'none');
  assert.equal(isLinked(initialConnectionFromSearch('')), false);
  assert.equal(initialConnectionFromSearch('?bankState=reconnect').status, 'needsReconnect');
  assert.equal(initialConnectionFromSearch('?bankState=syncing').status, 'syncing');
  assert.equal(initialConnectionFromSearch('?bankState=linked').status, 'upToDate');
});

test('only ?bankState= turns the preview fixtures on; a real account starts empty', () => {
  assert.equal(bankPreviewState(''), null);
  assert.equal(bankPreviewState('?bankTier=free'), null);
  assert.equal(bankPreviewState('?bankState=nope'), null);
  assert.equal(bankPreviewState('?bankState=linked'), 'linked');
  assert.equal(bankPreviewState('?bankState=reconnect'), 'reconnect');
  assert.equal(bankPreviewState('?bankState=syncing'), 'syncing');
  // Neither fixture ships a Plaid item id: only a real exchange sets one.
  assert.equal(emptyConnection().itemId, null);
  assert.equal(linkedConnection().itemId, null);
});

test('tier fixture: pro unless ?bankTier=free', () => {
  assert.equal(bankTierFromSearch(''), 'pro');
  assert.equal(bankTierFromSearch('?bankTier=free'), 'free');
  assert.equal(bankTierFromSearch('?bankTier=pro'), 'pro');
  assert.equal(bankTierFromSearch('?x=1'), 'pro');
});

test('Settings row: Connect bank → Bank accounts - N, Pro when locked', () => {
  const empty = emptyConnection();
  assert.equal(bankRowTitle(empty, 'pro'), 'Connect bank');
  assert.equal(bankRowTitle(empty, 'free'), 'Connect bank');
  assert.equal(bankRowValue(empty, 'pro'), null);
  assert.equal(bankRowValue(empty, 'free'), 'Pro');

  const linked = linkedConnection();
  assert.equal(trackedCount(linked), 2);
  assert.deepEqual(trackedAccounts(linked).map((a) => a.id), ['chk-4821', 'cc-5510']);
  assert.equal(bankRowTitle(linked, 'pro'), 'Bank accounts - 2');
  assert.equal(bankRowValue(linked, 'pro'), null);
  assert.equal(bankRowTitle(linked, 'free'), 'Connect bank');
  assert.equal(bankRowValue(linked, 'free'), 'Pro');

  // Reconnect shows as the value, with no red anywhere.
  const reconnect = linkedConnection('needsReconnect');
  assert.equal(bankRowValue(reconnect, 'pro'), 'Reconnect');
  assert.equal(ACCOUNT_STATUS_COPY.needsReconnect, 'Needs reconnect');
});

test('status copy: syncing and up to date, nothing for the pitch', () => {
  assert.equal(ACCOUNT_STATUS_COPY.syncing, 'Syncing');
  assert.equal(ACCOUNT_STATUS_COPY.upToDate, 'Up to date');
  assert.equal(ACCOUNT_STATUS_COPY.none, '');
});

// ── The real item → the same connection the screens render ──
const REAL_ITEM: BankItemApi = {
  id: 'item-row-1',
  institution_name: 'Chase',
  status: 'active',
  last_synced_at: '2026-11-01T10:00:00.000Z',
  accounts: [
    { id: 'a1', name: 'Business Checking', mask: '4821', type: 'depository', subtype: 'checking', track: true },
    { id: 'a2', name: 'Business Savings', mask: '9930', type: 'depository', subtype: 'savings', track: false },
    { id: 'a3', name: 'Ink Card', mask: '5510', type: 'credit', subtype: 'credit card', track: true },
  ],
};

test('a real item maps to the linked card the screens already render', () => {
  const connection = itemToConnection(REAL_ITEM);
  assert.equal(connection.itemId, 'item-row-1');
  assert.equal(connection.status, 'upToDate');
  assert.equal(connection.institution, 'Chase');
  assert.deepEqual(connection.tracked, ['a1', 'a3']);
  assert.deepEqual(connection.accounts.map((a) => a.id), ['a1', 'a2', 'a3']);
  assert.deepEqual(connection.accounts.map((a) => a.kind), ['checking', 'savings', 'credit']);
  assert.equal(connection.digestTime, BANK_DIGEST_DEFAULT);
  // The Settings count follows the real tracked ids, not a fixture.
  assert.equal(bankRowTitle(connection, 'pro'), 'Bank accounts - 2');
});

test('kind: credit wins, savings is savings, unknown is checking', () => {
  assert.equal(bankKind('credit', 'credit card'), 'credit');
  assert.equal(bankKind('depository', 'savings'), 'savings');
  assert.equal(bankKind('loan', 'line of credit'), 'credit');
  assert.equal(bankKind('other', 'money market'), 'checking');
  assert.equal(bankKind(null, null), 'checking');
  assert.equal(bankKind(undefined, undefined), 'checking');
});

test('status: active is up to date, needs_reconnect keeps its gold, unknown polls', () => {
  assert.equal(bankConnectionStatus('syncing'), 'syncing');
  assert.equal(bankConnectionStatus('active'), 'upToDate');
  assert.equal(bankConnectionStatus('needs_reconnect'), 'needsReconnect');
  assert.equal(bankConnectionStatus('something_new'), 'syncing');
  assert.equal(bankConnectionStatus(null), 'syncing');
});

test('a null mask is empty, never the word null', () => {
  const connection = itemToConnection({
    ...REAL_ITEM,
    accounts: [{ id: 'a1', name: 'Account', mask: null, type: null, subtype: null, track: false }],
  });
  assert.equal(connection.accounts[0].mask, '');
  assert.equal(connection.accounts[0].kind, 'checking');
  assert.deepEqual(connection.tracked, []);
  assert.equal(connection.status, 'upToDate');
});

test('multi-bank is parked: the newest item is the connection', () => {
  const older = { ...REAL_ITEM, id: 'older', institution_name: 'Wells Fargo' };
  const connection = connectionFromItems([REAL_ITEM, older]);
  assert.equal(connection?.itemId, 'item-row-1');
  assert.equal(connection?.institution, 'Chase');
  assert.equal(connectionFromItems([]), null);
});

test('digest time: 24h fixture → 12h label, 7:00 PM default', () => {
  assert.equal(BANK_DIGEST_DEFAULT, '19:00');
  assert.equal(digestLabel('19:00'), '7:00 PM');
  assert.equal(digestLabel('08:00'), '8:00 AM');
  assert.equal(digestLabel('12:00'), '12:00 PM');
  assert.equal(digestLabel('00:30'), '12:30 AM');
  assert.equal(digestSentence('19:00'), 'Every day at 7:00 PM.');
  assert.ok(DIGEST_OPTIONS.includes(BANK_DIGEST_DEFAULT));
});
