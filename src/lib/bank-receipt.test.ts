// ═══ The client key must be the key the server rebuilds ═══
// A mismatch here is invisible until a real photo fails with receipt_missing, so
// the two builders are asserted against each other.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RECEIPT_BUCKET, receiptStoragePath } from './bank-receipt';
import { receiptObjectPath } from './plaid/receipt-verify';

const OWNER = '6f1b8c2e-3a4d-4e5f-8a9b-0c1d2e3f4a5b';
const HASH = 'c'.repeat(64);

test('the card uploads to the same key the review route rebuilds', () => {
  assert.equal(RECEIPT_BUCKET, 'receipts', 'the private bucket Chat already uses');
  assert.equal(receiptStoragePath(OWNER, HASH), `${OWNER}/${HASH}.jpg`);
  assert.equal(receiptStoragePath(OWNER, HASH), receiptObjectPath(OWNER, HASH));
});

test('the key is flat: owner folder plus the hash, nothing else', () => {
  const path = receiptStoragePath(OWNER, HASH);
  assert.equal(path.split('/').length, 2, 'foldername[1] is the owner, so the policy admits it');
  assert.equal(path.split('/')[0], OWNER);
  assert.equal(path.endsWith(`/${HASH}.jpg`), true, 'no extra segments to normalise');
});
