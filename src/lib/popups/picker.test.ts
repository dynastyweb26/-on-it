import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INVOICE_CHOICE_EMPTY, USE_NAME_SUB, createPickGuard, pickerLoadFailure, signFailureMessage } from './picker';

const offline = new TypeError('Failed to fetch');

test('pickerLoadFailure: offline names the cause and what still works', () => {
  const f = pickerLoadFailure('clients', offline);
  assert.equal(f.title, 'Couldn’t load your clients');
  assert.equal(f.body, 'You’re offline. You can still type a name above and use it.');
});

test('pickerLoadFailure: a non-network failure does not claim to be offline', () => {
  const f = pickerLoadFailure('items', { status: 500, message: 'boom' });
  assert.equal(f.title, 'Couldn’t load your items');
  assert.ok(!/offline/i.test(f.body));
  assert.ok(f.body.endsWith('You can still type a name above and use it.'));
  assert.ok(!f.body.includes('boom'), 'the raw message is never printed');
});

test('USE_NAME_SUB says nothing is saved', () => {
  assert.equal(USE_NAME_SUB, 'Just this once. Nothing is saved.');
});

test('createPickGuard: the second tap in the same frame has nothing to hit', () => {
  const guard = createPickGuard();
  assert.equal(guard.claim(), true);
  assert.equal(guard.claim(), false);
  assert.equal(guard.claim(), false);
});

test('createPickGuard: a failed pick hands the turn back', () => {
  const guard = createPickGuard();
  assert.equal(guard.claim(), true);
  guard.release();
  assert.equal(guard.claim(), true);
});

test('signFailureMessage: offline gets the cause, other failures keep the old sentence', () => {
  assert.equal(signFailureMessage(offline), 'You’re offline. Nothing was signed. Approve again when you’re back.');
  assert.equal(signFailureMessage({ status: 500 }), "Couldn't approve. Please try again.");
});

test('INVOICE_CHOICE_EMPTY says why the list is empty', () => {
  assert.equal(INVOICE_CHOICE_EMPTY, 'No unpaid invoices to link this to.');
});
