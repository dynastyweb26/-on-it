import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freePlanSummary, usageLine } from './usage';

const snap = { estimateCount: 0, estimateLimit: 3, invoiceCount: 1, invoiceLimit: 3, expenseCount: 2, expenseLimit: 5 };

test('estimates warn at limit-1 and say last free at the limit', () => {
  assert.equal(usageLine('estimate', { ...snap, estimateCount: 1 }), '1 of 3 free estimates used');
  assert.equal(usageLine('estimate', { ...snap, estimateCount: 2 }), '2 of 3 free estimates used. 1 left.');
  assert.equal(usageLine('estimate', { ...snap, estimateCount: 3 }), 'Last free estimate. Your next one starts a free trial.');
  assert.equal(usageLine('estimate', { ...snap, estimateCount: 3, trialEligible: false }), 'Last free estimate.');
});

test('estimates say nothing with no cap, no count yet, or past the cap', () => {
  assert.equal(usageLine('estimate', { ...snap, estimateLimit: null }), null);
  assert.equal(usageLine('estimate', { ...snap, estimateCount: 0 }), null);
  assert.equal(usageLine('estimate', { ...snap, estimateCount: 4 }), null);
  assert.equal(usageLine('estimate', null), null);
});

test('invoice and expense lines are unchanged', () => {
  assert.equal(usageLine('invoice', { ...snap, invoiceCount: 2 }), '2 of 3 free invoices used');
  assert.equal(usageLine('expense', { ...snap, expenseCount: 5, trialEligible: false }), 'Last free expense.');
});

test('free plan summary lists estimates only when they are capped', () => {
  assert.equal(freePlanSummary(snap), '1 of 3 invoices · 2 of 5 expenses · 0 of 3 estimates used');
  assert.equal(freePlanSummary({ ...snap, estimateLimit: null }), '1 of 3 invoices · 2 of 5 expenses used');
  assert.equal(freePlanSummary({ ...snap, invoiceLimit: null }), null);
});
