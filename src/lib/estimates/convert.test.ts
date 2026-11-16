import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachmentsSkippedColumns, convertedDepositColumns } from './convert';

test('a percentage deposit converts with a derived amount', () => {
  assert.deepEqual(
    convertedDepositColumns({ total: 421.95, deposit_type: 'percentage', deposit_value: 60, deposit_amount: null }),
    { deposit_type: 'percentage', deposit_value: 60, deposit_amount: 253.17 },
  );
});

test('a fixed deposit converts and is clamped to the total', () => {
  assert.deepEqual(
    convertedDepositColumns({ total: 300, deposit_type: 'fixed', deposit_value: 500, deposit_amount: 500 }),
    { deposit_type: 'fixed', deposit_value: 500, deposit_amount: 300 },
  );
});

test('no deposit converts to none', () => {
  const none = { deposit_type: 'none', deposit_value: null, deposit_amount: null } as const;
  assert.deepEqual(convertedDepositColumns({ total: 300, ...none }), none);
  assert.deepEqual(
    convertedDepositColumns({ total: 300, deposit_type: null, deposit_value: null, deposit_amount: null }),
    none,
  );
});

// ── Tiers: the skipped-photos columns on the new invoice ────────────────────

test('skipped photos: flag off writes nothing (today exactly)', () => {
  assert.equal(attachmentsSkippedColumns(false, { count: 2, sourceNumber: 51 }), null);
});

test('skipped photos: nothing skipped writes nothing, never a zero row', () => {
  assert.equal(attachmentsSkippedColumns(true, { count: 0, sourceNumber: 51 }), null);
  assert.equal(attachmentsSkippedColumns(true, { count: -1, sourceNumber: 51 }), null);
  assert.equal(attachmentsSkippedColumns(true, { count: Number.NaN, sourceNumber: 51 }), null);
});

test('skipped photos: the count and the source document number', () => {
  assert.deepEqual(attachmentsSkippedColumns(true, { count: 2, sourceNumber: 51 }), {
    attachments_skipped: 2,
    attachments_skipped_from: 51,
  });
  // A decimal count is floored: the column is an integer with a >= 0 check.
  assert.deepEqual(attachmentsSkippedColumns(true, { count: 2.9, sourceNumber: 7 }), {
    attachments_skipped: 2,
    attachments_skipped_from: 7,
  });
});

test('skipped photos: a missing source keeps the count, drops the number', () => {
  for (const sourceNumber of [null, undefined, 0, -3, 1.5, Number.NaN]) {
    assert.deepEqual(
      attachmentsSkippedColumns(true, { count: 1, sourceNumber }),
      { attachments_skipped: 1, attachments_skipped_from: null },
      String(sourceNumber),
    );
  }
});
