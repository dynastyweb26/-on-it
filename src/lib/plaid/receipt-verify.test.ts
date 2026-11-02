// ═══ Receipt attach: what the server refuses, before any write ═══
// The route is structural-testable only; the refusals live here as pure functions
// so the security rules are asserted with real bytes rather than substrings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  MAX_RECEIPT_BYTES, RECEIPT_BUCKET, hasUnsafeKeySegments, isJpeg, isReceiptHash,
  receiptObjectPath, uniqueViolation, verifyReceipt,
} from './receipt-verify';

/** Stands in for lib/receipt.ts' sha256Hex: the digest of the ORIGINAL file. */
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

const OWNER = '6f1b8c2e-3a4d-4e5f-8a9b-0c1d2e3f4a5b';
const OTHER = '11111111-2222-4333-8444-555555555555';

/** A minimal but real JPEG: SOI + APP0 marker start + EOI. */
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0xff, 0xd9]);
const HASH = sha(JPEG);

test('the path is built from the caller id, never from a request field', () => {
  assert.equal(receiptObjectPath(OWNER, HASH), `${OWNER}/${HASH}.jpg`);
  // Another user's folder cannot be expressed: there is no parameter for a path.
  assert.equal(receiptObjectPath(OTHER, HASH), `${OTHER}/${HASH}.jpg`);
  assert.equal(RECEIPT_BUCKET, 'receipts');
  assert.equal(isReceiptHash(HASH), true);
});

test('a hash that is not 64 lowercase hex is refused before storage is touched', () => {
  for (const bad of [
    'xyz', '', HASH.toUpperCase(), `${HASH}.jpg`, `../${HASH}`, `${HASH}/../evil`,
    'a'.repeat(63), 'a'.repeat(65), `${'a'.repeat(64)}\n`, null, undefined, 42,
  ]) {
    assert.equal(isReceiptHash(bad), false, String(bad));
    assert.equal(verifyReceipt(JPEG, bad), 'receipt_invalid');
    assert.equal(receiptObjectPath(OWNER, bad), null, `no path for ${String(bad)}`);
  }
});

test('a traversal-shaped key is rejected even when the prefix matches', () => {
  const escape = `${OWNER}/../../${OTHER}/receipt.jpg`;
  assert.equal(hasUnsafeKeySegments(escape), true);
  assert.equal(hasUnsafeKeySegments(`${OWNER}/${HASH}.jpg`), false);
  // And the builder never produces one: the hash segment is hex only, so a
  // dot-segment cannot survive the regex.
  assert.equal(receiptObjectPath(OWNER, `..%2f${HASH}`), null);
});

test('missing, oversized and non-JPEG objects each get their own answer', () => {
  assert.equal(verifyReceipt(null, HASH), 'receipt_missing');
  assert.equal(verifyReceipt(new Uint8Array(0), HASH), 'receipt_missing');

  const tooBig = new Uint8Array(MAX_RECEIPT_BYTES + 1);
  tooBig.set([0xff, 0xd8, 0xff]);
  assert.equal(verifyReceipt(tooBig, HASH), 'receipt_too_large');

  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(verifyReceipt(png, HASH), 'receipt_not_jpeg');

  // ── The regression this test exists for ───────────────────────────────────
  // The stored object is the RE-COMPRESSED JPEG; the claimed hash is the digest
  // of the ORIGINAL file (lib/receipt.ts hashes file.arrayBuffer() before it
  // decodes). For a real photo the two can never be equal, so a stored-bytes
  // equality check refused every genuine receipt with 422 receipt_mismatch —
  // this assertion fails if that check comes back.
  assert.notEqual(sha(JPEG), sha(png));
  assert.equal(
    verifyReceipt(JPEG, sha(png)),
    null,
    'a real receipt is accepted even though its stored bytes hash to something else',
  );

  assert.equal(isJpeg(JPEG), true);
  assert.equal(isJpeg(new Uint8Array([0xff, 0xd8])), false, 'a 2-byte prefix is not a JPEG');
  assert.equal(verifyReceipt(JPEG, HASH), null, 'the real pair verifies');
});

test('the two 23505 indexes are told apart by constraint name, never blended', () => {
  const receipt = { code: '23505', message: 'duplicate key value violates unique constraint "expenses_user_receipt_hash_idx"' };
  const replay = { code: '23505', message: 'duplicate key value violates unique constraint "expenses_user_plaid_transaction_uidx"' };
  assert.equal(uniqueViolation(receipt), 'receipt_hash');
  assert.equal(uniqueViolation(replay), 'plaid_transaction_id');
  // A 23505 without a recognisable name must not be treated as a receipt clash.
  assert.equal(uniqueViolation({ code: '23505', message: 'duplicate key value' }), 'other');
  assert.equal(uniqueViolation({ code: '23503', message: 'fk' }), 'other');
  assert.equal(uniqueViolation(null), 'other');
});
