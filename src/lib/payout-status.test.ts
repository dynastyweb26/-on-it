import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bankStatus, handleStatus, isPayoutMethod, stripeStatus, zelleStatus } from './payout-status';

test('stripe: Connect off in this deployment → Coming soon, whatever is stored', () => {
  assert.deepEqual(stripeStatus({ stripe_account_id: 'acct_1', stripe_charges_enabled: true, stripe_payouts_enabled: true }, false),
    { text: 'Coming soon', tone: 'muted' });
});

test('stripe: no account → Not connected', () => {
  assert.deepEqual(stripeStatus({}, true), { text: 'Not connected', tone: 'muted' });
  assert.deepEqual(stripeStatus({ stripe_account_id: null }, true), { text: 'Not connected', tone: 'muted' });
});

test('stripe: account but seller owes details → Action needed', () => {
  assert.deepEqual(stripeStatus({ stripe_account_id: 'acct_1', stripe_charges_enabled: false, stripe_details_submitted: false }, true),
    { text: 'Action needed', tone: 'error' });
});

test('stripe: submitted, not yet charging → In review', () => {
  assert.deepEqual(stripeStatus({ stripe_account_id: 'acct_1', stripe_charges_enabled: false, stripe_details_submitted: true }, true),
    { text: 'In review', tone: 'muted' });
});

test('stripe: charging but payouts paused → Action needed', () => {
  assert.deepEqual(stripeStatus({ stripe_account_id: 'acct_1', stripe_charges_enabled: true, stripe_details_submitted: true, stripe_payouts_enabled: false }, true),
    { text: 'Action needed', tone: 'error' });
});

test('stripe: charging and paying out → Connected', () => {
  assert.deepEqual(stripeStatus({ stripe_account_id: 'acct_1', stripe_charges_enabled: true, stripe_details_submitted: true, stripe_payouts_enabled: true }, true),
    { text: 'Connected', tone: 'default' });
});

test('bank: not set / off / on', () => {
  assert.deepEqual(bankStatus({}), { text: 'Not set', tone: 'muted' });
  assert.deepEqual(bankStatus({ bank_account_last4: '5678', bank_transfer_enabled: false }), { text: 'Off', tone: 'muted' });
  assert.deepEqual(bankStatus({ bank_account_last4: '5678', bank_transfer_enabled: null }), { text: 'Off', tone: 'muted' });
  assert.deepEqual(bankStatus({ bank_account_last4: '5678', bank_transfer_enabled: true }), { text: '••••5678', tone: 'default' });
});

test('zelle: shows the server mask, or Not set', () => {
  assert.deepEqual(zelleStatus('••••4558'), { text: '••••4558', tone: 'default' });
  assert.deepEqual(zelleStatus(null), { text: 'Not set', tone: 'muted' });
  assert.deepEqual(zelleStatus(''), { text: 'Not set', tone: 'muted' });
});

test('handles: sigil per method, blank → Not set', () => {
  assert.deepEqual(handleStatus('cashapp', 'joesplumbing'), { text: '$joesplumbing', tone: 'default' });
  assert.deepEqual(handleStatus('venmo', 'joe-plumb'), { text: '@joe-plumb', tone: 'default' });
  assert.deepEqual(handleStatus('paypal', 'joeplumb'), { text: 'joeplumb', tone: 'default' });
  assert.deepEqual(handleStatus('venmo', null), { text: 'Not set', tone: 'muted' });
  assert.deepEqual(handleStatus('cashapp', '   '), { text: 'Not set', tone: 'muted' });
});

test('isPayoutMethod: only the six routes', () => {
  for (const m of ['stripe', 'bank', 'zelle', 'cashapp', 'paypal', 'venmo']) assert.equal(isPayoutMethod(m), true);
  assert.equal(isPayoutMethod('cash-app'), false);
  assert.equal(isPayoutMethod(''), false);
});
