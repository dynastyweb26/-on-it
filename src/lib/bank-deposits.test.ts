// The deposit card's rules: what it offers, what it says, what it posts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEPOSIT_PAYOUT_TOAST, DEPOSIT_TAKEN_TOAST, depositActions, depositBody, depositDoneToast,
  depositNote, depositPlan, depositRefusalMessage, depositSubline, type ApiDeposit,
} from './bank-deposits';
import { STRIPE_PAYOUT_NOTE } from './plaid/payouts';

const row = (over: Partial<ApiDeposit> = {}): ApiDeposit => ({
  id: 'dep-1',
  name: 'ZELLE FROM MIKE',
  merchant: 'Mike Davis',
  amount_cents: 45000,
  occurred_on: '2026-10-28',
  pending: false,
  removed: false,
  is_stripe_payout: false,
  link: null,
  suggestion: null,
  ...over,
});

test('404 is the gate; a deposit list is read; anything else is an error', () => {
  assert.deepEqual(depositPlan(404, null), { kind: 'none' });
  const plan = depositPlan(200, { deposits: [row()], invoices: [], payments: [] });
  assert.equal(plan.kind, 'rows');
  if (plan.kind === 'rows') assert.equal(plan.deposits.length, 1);
  assert.deepEqual(depositPlan(500, { deposits: [] }), { kind: 'error' });
});

test('an ordinary deposit offers all three decisions', () => {
  assert.deepEqual(depositActions(row()), ['record', 'already', 'not_income']);
});

test('a Stripe payout offers only Not income', () => {
  assert.deepEqual(depositActions(row({ is_stripe_payout: true })), ['not_income']);
});

test('a deposit the bank removed offers nothing: no ledger is reversed here', () => {
  assert.deepEqual(depositActions(row({ removed: true })), []);
  assert.deepEqual(depositActions(row({ removed: true, is_stripe_payout: true })), []);
});

test('the payout note is shown, and removal explains that nothing changed', () => {
  assert.equal(depositNote(row({ is_stripe_payout: true })), STRIPE_PAYOUT_NOTE);
  assert.match(depositNote(row({ removed: true })) ?? '', /Nothing in your payments was changed/);
  assert.equal(depositNote(row()), null);
});

test('the POST body carries ids only, never an amount or a name', () => {
  assert.deepEqual(depositBody('dep-1', 'record', { invoice_id: 'inv-1' }), {
    deposit_id: 'dep-1', action: 'record', invoice_id: 'inv-1',
  });
  assert.deepEqual(depositBody('dep-1', 'record'), { deposit_id: 'dep-1', action: 'record' });
  assert.deepEqual(depositBody('dep-1', 'already', { payment_id: 'pay-1' }), {
    deposit_id: 'dep-1', action: 'already', payment_id: 'pay-1',
  });
  assert.deepEqual(depositBody('dep-1', 'not_income', { invoice_id: 'inv-1' }), {
    deposit_id: 'dep-1', action: 'not_income',
  });
});

test('a refusal never reads as a save, and the payout refusal is explicit', () => {
  assert.equal(depositRefusalMessage('payout_not_income'), DEPOSIT_PAYOUT_TOAST);
  assert.equal(depositRefusalMessage('payment_taken'), DEPOSIT_TAKEN_TOAST);
  assert.match(depositRefusalMessage('over_limit'), /more than the deposit/);
  assert.match(depositRefusalMessage(null), /didn’t save/);
  assert.equal(depositDoneToast('not_income'), 'Marked as not income.');
});

test('the subline names the invoice only when an exact signal fired', () => {
  const matched = row({ suggestion: { invoice_id: 'inv-1', invoice_number: 42, reason: 'invoice_number' }, is_stripe_payout: false });
  assert.match(depositSubline(matched), /Looks like INV-0042/);
  assert.match(depositSubline(row()), /No invoice matches yet/);
});
