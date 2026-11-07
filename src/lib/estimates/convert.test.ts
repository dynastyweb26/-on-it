import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertedDepositColumns } from './convert';

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
