// The deposit card's rules: what it offers, what it says, what it posts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEPOSIT_DECIDED_TOAST, DEPOSIT_PAYOUT_TOAST, DEPOSIT_TAKEN_TOAST, depositActions,
  depositBody, depositDoneToast, depositMetaLine, depositNote, depositPaths, depositPlan,
  depositRefusalMessage, depositRestoreBody, depositSubline, depositSubmit, type ApiDeposit,
} from './bank-deposits';
import { STRIPE_PAYOUT_CAUTION } from './plaid/payouts';

const row = (over: Partial<ApiDeposit> = {}): ApiDeposit => ({
  id: 'dep-1',
  name: 'ZELLE FROM MIKE',
  merchant: 'Mike Davis',
  amount_cents: 45000,
  occurred_on: '2026-10-28',
  pending: false,
  removed: false,
  is_stripe_payout: false,
  payout: 'not_stripe',
  accounted: false,
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

test('an ordinary deposit offers exactly two buttons: Save + Don\'t add', () => {
  const actions = depositActions(row());
  assert.deepEqual(actions, ['record', 'ignored']);
  assert.equal(actions.length, 2, 'never three buttons on a card');
  // The retired kind must not be reachable from the card.
  assert.equal(actions.includes('not_income' as never), false);
});

test('a STRIPE deposit still shows two buttons, but never offers a new payment', () => {
  const actions = depositActions(row({ payout: 'ambiguous', is_stripe_payout: true }));
  assert.deepEqual(actions, ['record', 'ignored']);
  assert.equal(actions.length, 2);
  // The refusal lives in the paths, so "a new payment" cannot even be chosen.
  assert.deepEqual(depositPaths(row({ payout: 'ambiguous' })), ['existing', 'other']);
});

test('the three paths: an existing payment, a new payment, other money', () => {
  assert.deepEqual(depositPaths(row()), ['existing', 'invoice', 'other']);
  // A STRIPE lump is made of card payments already counted: no new payment.
  assert.deepEqual(depositPaths(row({ payout: 'ambiguous' })), ['existing', 'other']);
  assert.deepEqual(depositPaths(row({ removed: true })), []);
});

test('Save maps the chosen path to the one route action that belongs to it', () => {
  assert.deepEqual(depositSubmit(row(), { path: 'existing', payment_id: 'pay-1' }),
    { action: 'already', extra: { payment_id: 'pay-1' } });
  assert.deepEqual(depositSubmit(row(), { path: 'invoice', invoice_id: 'inv-1' }),
    { action: 'record', extra: { invoice_id: 'inv-1' } });
  assert.deepEqual(depositSubmit(row(), { path: 'other', classification: 'transfer' }),
    { action: 'classified', extra: { classification: 'transfer' } });
});

test('Save is refused with no pick, and on a path that is not offered', () => {
  assert.equal(depositSubmit(row(), { path: 'existing' }), null);
  assert.equal(depositSubmit(row(), { path: 'other' }), null);
  // A STRIPE deposit cannot submit a new payment even if the path is forced.
  assert.equal(depositSubmit(row({ payout: 'ambiguous' }), { path: 'invoice', invoice_id: 'inv-1' }), null);
  assert.equal(depositSubmit(row({ removed: true }), { path: 'other', classification: 'transfer' }), null);
});

test('restoring an Ignored deposit posts the restore action, ids only', () => {
  assert.deepEqual(depositRestoreBody('dep-1'), { deposit_id: 'dep-1', action: 'restore' });
});

test('a deposit the bank removed offers nothing: no ledger is reversed here', () => {
  assert.deepEqual(depositActions(row({ removed: true })), []);
  assert.deepEqual(depositActions(row({ removed: true, payout: 'ambiguous' })), []);
});

test('the note names the payout, the caution, or the removal — never silence', () => {
  // Every STRIPE descriptor is ambiguous, so the caution is the only payout note.
  assert.equal(depositNote(row({ payout: 'ambiguous' })), STRIPE_PAYOUT_CAUTION);
  assert.match(depositNote(row({ removed: true })) ?? '', /Nothing in your payments was changed/);
  assert.equal(depositNote(row()), null);
  // The exact caution copy: it names the one safe answer.
  assert.match(STRIPE_PAYOUT_CAUTION, /choose Don't add/);
  assert.match(STRIPE_PAYOUT_CAUTION, /Those card payments are already counted/);
});

test('the POST body carries ids only, never an amount or a name', () => {
  assert.deepEqual(depositBody('dep-1', 'record', { invoice_id: 'inv-1' }), {
    deposit_id: 'dep-1', action: 'record', invoice_id: 'inv-1',
  });
  assert.deepEqual(depositBody('dep-1', 'record'), { deposit_id: 'dep-1', action: 'record' });
  assert.deepEqual(depositBody('dep-1', 'already', { payment_id: 'pay-1' }), {
    deposit_id: 'dep-1', action: 'already', payment_id: 'pay-1',
  });
  assert.deepEqual(depositBody('dep-1', 'ignored', { invoice_id: 'inv-1' }), {
    deposit_id: 'dep-1', action: 'ignored',
  });
});

test('a classification is sent only with the classify action', () => {
  assert.deepEqual(depositBody('dep-1', 'classified', { classification: 'vendor_refund' }), {
    deposit_id: 'dep-1', action: 'classified', classification: 'vendor_refund',
  });
  // A stray classification on another action is dropped, so it cannot be stored.
  assert.deepEqual(depositBody('dep-1', 'ignored', { classification: 'transfer' }), {
    deposit_id: 'dep-1', action: 'ignored',
  });
  assert.deepEqual(depositBody('dep-1', 'classified'), {
    deposit_id: 'dep-1', action: 'classified',
  });
});

test('a refusal never reads as a save, and the payout refusal is explicit', () => {
  assert.equal(depositRefusalMessage('payout_not_income'), DEPOSIT_PAYOUT_TOAST);
  assert.equal(depositRefusalMessage('payment_taken'), DEPOSIT_TAKEN_TOAST);
  assert.equal(depositRefusalMessage('deposit_already_decided'), DEPOSIT_DECIDED_TOAST);
  assert.match(depositRefusalMessage('over_limit'), /more than the deposit/);
  assert.match(depositRefusalMessage(null), /didn’t save/);
});

test('a done toast says what happened to the totals, not just "saved"', () => {
  assert.match(depositDoneToast('ignored'), /out of your totals/);
  assert.match(depositDoneToast('already'), /already on record/);
  // The two income classifications count; the four non-income ones count nowhere.
  assert.match(depositDoneToast('classified', 'customer_payment'), /Added to your income/);
  assert.match(depositDoneToast('classified', 'other_income'), /Added to your income/);
  assert.match(depositDoneToast('classified', 'vendor_refund'), /counts in no total/);
  assert.match(depositDoneToast('classified', 'unknown'), /counts in no total/);
  assert.match(depositDoneToast('record'), /Payment recorded/);
});

test('the meta line under the payer reads date · account, never a placeholder', () => {
  assert.equal(
    depositMetaLine({ occurred_on: '2026-11-01', account: 'Plaid Mortgage ••8888' }),
    'Nov 1 · Plaid Mortgage ••8888',
  );
  // No account read? Say something true, but never the old placeholder.
  assert.equal(depositMetaLine({ occurred_on: '2026-11-01' }), 'Nov 1 · Bank account');
  assert.equal(depositMetaLine({ occurred_on: '2026-11-01', account: '   ' }), 'Nov 1 · Bank account');
  assert.equal(depositMetaLine({ occurred_on: '2026-11-01' }).includes('Bank deposit'), false);
});

test('the subline names the invoice only when an exact signal fired', () => {
  const matched = row({ suggestion: { invoice_id: 'inv-1', invoice_number: 42, reason: 'invoice_number' } });
  assert.match(depositSubline(matched), /Looks like INV-0042/);
  assert.match(depositSubline(row()), /No invoice matches yet/);
});
