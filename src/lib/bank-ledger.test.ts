// Pure rules of the bank ledger. The schema's own guarantees (RLS, token
// privacy, the expense-delete reopen, the server-only plaid_transaction_id)
// are executed in plaid-schema.test.ts against a real Postgres, not matched as
// text here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BANK_STATES,
  REVIEW_STATES,
  holdsExpense,
  isBankChange,
  isOpenReviewState,
  vendorOf,
} from './bank-ledger';

test('the open review set is what the stack still shows', () => {
  assert.deepEqual(REVIEW_STATES.filter(isOpenReviewState), ['new', 'needs_review']);
  assert.deepEqual(BANK_STATES, ['pending', 'posted', 'removed']);
  // The UI's Ignored tab is review_state 'ignored'; SPEC's hidden queue is gone.
  assert.equal((REVIEW_STATES as readonly string[]).includes('hidden'), false);
});

test('only the decided states hold an expense', () => {
  assert.deepEqual(REVIEW_STATES.filter(holdsExpense), ['added', 'already']);
  assert.equal(holdsExpense('ignored'), false);
  assert.equal(holdsExpense('needs_review'), false);
});

test('a vendor name falls back to what the bank printed', () => {
  assert.equal(vendorOf({ merchant: '  Costco Wholesale ', description: 'COSTCO #123' }), 'Costco Wholesale');
  assert.equal(vendorOf({ merchant: null, description: ' COSTCO #123 ' }), 'COSTCO #123');
  assert.equal(vendorOf({ merchant: '   ', description: 'SHELL 04' }), 'SHELL 04');
});

test('only removed and pending count as a bank-side change', () => {
  assert.equal(isBankChange('removed'), true);
  assert.equal(isBankChange('pending'), true);
  assert.equal(isBankChange('posted'), false);
});
