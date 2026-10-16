import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abaRoutingValid, BankDetailsSchema, ROUTING_ERROR, ACCOUNT_MISMATCH_ERROR, ACCOUNT_ERROR, maskAccount } from './bank';

const valid = {
  holderName: 'Test Holder',
  bankName: 'Test Bank',
  routing: '021000021',
  account: '123456784417',
  accountConfirm: '123456784417',
  accountType: 'checking' as const,
  enabled: true,
};

test('ABA checksum: valid routing numbers pass', () => {
  assert.equal(abaRoutingValid('021000021'), true);
  assert.equal(abaRoutingValid('011000015'), true);
});

test('ABA checksum: a one-digit typo fails', () => {
  assert.equal(abaRoutingValid('021000022'), false);
  assert.equal(abaRoutingValid('121000021'), false);
});

test('ABA checksum: wrong length or non-digits fail', () => {
  assert.equal(abaRoutingValid('02100002'), false);
  assert.equal(abaRoutingValid('0210000210'), false);
  assert.equal(abaRoutingValid('02100002a'), false);
  assert.equal(abaRoutingValid(''), false);
});

test('schema accepts valid details and strips spaces/dashes', () => {
  const r = BankDetailsSchema.safeParse({ ...valid, routing: '021 000 021', account: '1234-5678-4417', accountConfirm: '123456784417' });
  assert.equal(r.success, true);
  if (r.success) {
    assert.equal(r.data.routing, '021000021');
    assert.equal(r.data.account, '123456784417');
  }
});

test('schema rejects a bad routing number with the plain message', () => {
  const r = BankDetailsSchema.safeParse({ ...valid, routing: '021000022' });
  assert.equal(r.success, false);
  if (!r.success) assert.equal(r.error.issues[0].message, ROUTING_ERROR);
});

test('schema rejects an account number mismatch on confirm', () => {
  const r = BankDetailsSchema.safeParse({ ...valid, accountConfirm: '123456784418' });
  assert.equal(r.success, false);
  if (!r.success) assert.equal(r.error.issues[0].message, ACCOUNT_MISMATCH_ERROR);
});

test('schema rejects account numbers outside 4–17 digits', () => {
  for (const account of ['123', '123456789012345678']) {
    const r = BankDetailsSchema.safeParse({ ...valid, account, accountConfirm: account });
    assert.equal(r.success, false);
    if (!r.success) assert.equal(r.error.issues[0].message, ACCOUNT_ERROR);
  }
});

test('schema allows keeping the stored account (no account fields)', () => {
  const { account: _a, accountConfirm: _c, ...rest } = valid;
  assert.equal(BankDetailsSchema.safeParse(rest).success, true);
});

test('schema trims and caps names', () => {
  assert.equal(BankDetailsSchema.safeParse({ ...valid, holderName: '   ' }).success, false);
  assert.equal(BankDetailsSchema.safeParse({ ...valid, bankName: 'x'.repeat(101) }).success, false);
});

test('maskAccount shows only the last four', () => {
  assert.equal(maskAccount('4417'), '••••4417');
});
