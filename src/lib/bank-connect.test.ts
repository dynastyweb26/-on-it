// ═══ Bank connect: failed routes never look connected ═══
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONNECT_FAILED_TOAST, OPEN_BANK_FAILED_TOAST, exchangePlan, linkTokenPlan,
} from './bank-connect';

test('link-token: only a 404 is the mock build; a 2xx token opens Plaid', () => {
  assert.deepEqual(linkTokenPlan(404, { error: 'not found' }), { kind: 'mock' });
  assert.deepEqual(linkTokenPlan(200, { link_token: 'link-sandbox-1' }), {
    kind: 'open', token: 'link-sandbox-1',
  });
});

test('link-token: every other failure is a toast, never the placeholder sheet', () => {
  assert.deepEqual(linkTokenPlan(401, { error: 'unauthorized' }), {
    kind: 'error', message: OPEN_BANK_FAILED_TOAST,
  });
  assert.deepEqual(linkTokenPlan(429, { error: 'rate limited' }), {
    kind: 'error', message: OPEN_BANK_FAILED_TOAST,
  });
  assert.deepEqual(linkTokenPlan(503, { error: 'plaid_not_configured' }), {
    kind: 'error', message: OPEN_BANK_FAILED_TOAST,
  });
  // The server's message wins when it has one.
  assert.deepEqual(linkTokenPlan(401, { message: 'Sign in again.' }), {
    kind: 'error', message: 'Sign in again.',
  });
  // A 2xx that forgot the token is a failure, not a mock handoff.
  assert.deepEqual(linkTokenPlan(200, {}), { kind: 'error', message: OPEN_BANK_FAILED_TOAST });
  assert.deepEqual(linkTokenPlan(200, { link_token: 42 }), {
    kind: 'error', message: OPEN_BANK_FAILED_TOAST,
  });
});

test('exchange: a success carries the item id and institution', () => {
  assert.deepEqual(exchangePlan(200, { item_id: 'item-1', institution_name: 'Chase' }), {
    kind: 'ok', itemId: 'item-1', institution: 'Chase',
  });
  assert.deepEqual(exchangePlan(200, {}), { kind: 'ok', itemId: null, institution: null });
});

test('exchange: a non-2xx never advances, even if the body looks successful', () => {
  const linked = exchangePlan(409, {
    error: 'already_linked',
    message: 'This bank is already linked. Disconnect it first, then connect it again.',
  });
  assert.deepEqual(linked, {
    kind: 'error',
    message: 'This bank is already linked. Disconnect it first, then connect it again.',
  });

  assert.deepEqual(exchangePlan(500, { item_id: 'item-1' }), {
    kind: 'error', message: CONNECT_FAILED_TOAST,
  });
  assert.deepEqual(exchangePlan(401, { error: 'unauthorized', message: 'Sign in again to connect your bank.' }), {
    kind: 'error', message: 'Sign in again to connect your bank.',
  });
  assert.deepEqual(exchangePlan(502, { error: 'exchange_failed' }), {
    kind: 'error', message: CONNECT_FAILED_TOAST,
  });
});
