import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TABS, exactTabIndex, tabIndexOf } from './tabs';

test('TABS keeps the five primary tabs in visual order', () => {
  assert.deepEqual(TABS.map((t) => t.href), [
    '/clients',
    '/invoices',
    '/chat',
    '/dashboard',
    '/settings',
  ]);
  assert.deepEqual(TABS.map((t) => t.label), [
    'Clients',
    'Invoices',
    'Chat',
    'Books',
    'Settings',
  ]);
});

test('tabIndexOf resolves nested routes to their parent tab', () => {
  assert.equal(tabIndexOf('/clients'), 0);
  assert.equal(tabIndexOf('/clients/123'), 0);
  assert.equal(tabIndexOf('/invoices/abc/edit'), 1);
  assert.equal(tabIndexOf('/chat'), 2);
  assert.equal(tabIndexOf('/dashboard/recurring'), 3);
  assert.equal(tabIndexOf('/settings/plan'), 4);
  assert.equal(tabIndexOf('/expenses'), -1);
  assert.equal(tabIndexOf('/'), -1);
});

test('exactTabIndex only matches the tab root', () => {
  assert.equal(exactTabIndex('/clients'), 0);
  assert.equal(exactTabIndex('/invoices'), 1);
  assert.equal(exactTabIndex('/chat'), 2);
  assert.equal(exactTabIndex('/dashboard'), 3);
  assert.equal(exactTabIndex('/settings'), 4);
  assert.equal(exactTabIndex('/clients/123'), -1);
  assert.equal(exactTabIndex('/settings/plan'), -1);
  assert.equal(exactTabIndex('/expenses'), -1);
  assert.equal(exactTabIndex('/'), -1);
});
