import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanDepositText, depositTextToNumber, settleDeposit } from './deposit-input';

test('cleanDepositText: strips leading zeros, keeps decimals', () => {
  assert.equal(cleanDepositText('045'), '45');
  assert.equal(cleanDepositText('0'), '0');
  assert.equal(cleanDepositText('0.5'), '0.5');
  assert.equal(cleanDepositText('00.5'), '0.5');
  assert.equal(cleanDepositText(''), '');
  assert.equal(cleanDepositText('1.2.3'), '1.23');
  assert.equal(cleanDepositText('$1,200'), '1200');
  assert.equal(cleanDepositText('-5'), '5');
});

test('depositTextToNumber: empty saves 0', () => {
  assert.equal(depositTextToNumber(''), 0);
  assert.equal(depositTextToNumber('.'), 0);
  assert.equal(depositTextToNumber('5.'), 5);
  assert.equal(depositTextToNumber('45'), 45);
});

test('settleDeposit: percentage capped at 100 on blur, fixed is not', () => {
  assert.equal(settleDeposit('150', 'percentage'), 100);
  assert.equal(settleDeposit('', 'percentage'), 0);
  assert.equal(settleDeposit('1500', 'fixed'), 1500);
});
