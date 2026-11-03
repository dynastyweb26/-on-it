// What the income form accepts, before a request is made.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INCOME_NOTE_MAX, incomeDateOptions, incomeError, incomeInsertRow, incomeWriteRefusal, isIsoDay,
  parseIncomeInput, shiftIso,
} from './income-form';

const good = {
  amount: '450.50', title: ' Storage unit rent ', client_name: '', received_on: '2026-11-01', note: '',
};

test('a complete row is trimmed, rounded to cents and defaulted', () => {
  const parsed = parseIncomeInput(good);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.value, {
    amount: 450.5,
    title: 'Storage unit rent',
    client_name: null,
    received_on: '2026-11-01',
    note: null,
  });
});

test('a float amount becomes cents, never a tail', () => {
  const parsed = parseIncomeInput({ ...good, amount: 10.005 });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.value.amount, 10.01);
});

test('each refusal has its own code, so the form can say what is wrong', () => {
  const code = (over: Record<string, unknown>) => {
    const parsed = parseIncomeInput({ ...good, ...over });
    return parsed.ok ? 'ok' : parsed.code;
  };
  assert.equal(code({ amount: '0' }), 'amount_invalid');
  assert.equal(code({ amount: '-5' }), 'amount_invalid');
  assert.equal(code({ amount: 'abc' }), 'amount_invalid');
  assert.equal(code({ title: '   ' }), 'title_missing');
  assert.equal(code({ title: 'x'.repeat(201) }), 'title_too_long');
  assert.equal(code({ client_name: 'x'.repeat(201) }), 'client_too_long');
  assert.equal(code({ note: 'x'.repeat(INCOME_NOTE_MAX + 1) }), 'note_too_long');
  assert.equal(code({ received_on: '2026-02-30' }), 'date_invalid');
  assert.equal(code({ received_on: '11/01/2026' }), 'date_invalid');
});

test('a date must be a real calendar day', () => {
  assert.equal(isIsoDay('2026-02-28'), true);
  assert.equal(isIsoDay('2026-02-29'), false);
  assert.equal(isIsoDay('2024-02-29'), true);
  assert.equal(isIsoDay('2026-13-01'), false);
});

test('the inserted row is Other income, and the owner comes from the session', () => {
  const parsed = parseIncomeInput(good);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(incomeInsertRow('user-1', parsed.value), {
    user_id: 'user-1',
    amount: 450.5,
    title: 'Storage unit rent',
    client_name: null,
    received_on: '2026-11-01',
    note: null,
    deposit_id: null,
    classification: 'other_income',
  });
});

test('every refusal code has owner-readable copy', () => {
  assert.match(incomeError('amount_invalid'), /bigger than zero/);
  assert.match(incomeError('title_missing'), /name/);
  assert.match(incomeError('date_invalid'), /day the money arrived/);
  assert.match(incomeError('something_else'), /didn’t save/);
});

test('the date chips are the row date, today and yesterday, de-duped', () => {
  assert.deepEqual(incomeDateOptions('2026-11-01', '2026-11-02'), ['2026-11-01', '2026-11-02']);
  assert.deepEqual(incomeDateOptions('2026-11-02', '2026-11-02'), ['2026-11-02', '2026-11-01']);
  assert.deepEqual(incomeDateOptions(null, '2026-11-02'), ['2026-11-02', '2026-11-01']);
  assert.equal(shiftIso('2026-03-01', -1), '2026-02-28');
});

test('a deposit-backed row refuses delete and an amount change, and nothing else', () => {
  const fromDeposit = { deposit_id: 'dep-1' };
  // Deleting would leave the deposit decided with no money behind it, and the
  // guard and unique index still count the soft-deleted row.
  assert.equal(incomeWriteRefusal(fromDeposit, 'delete'), 'from_deposit');
  assert.equal(incomeWriteRefusal(fromDeposit, 'edit', { amount: 12 }), 'from_deposit');
  // A rename or a note is fine: the money is not touched.
  assert.equal(incomeWriteRefusal(fromDeposit, 'edit', { title: 'New name' }), null);
  assert.equal(incomeWriteRefusal(fromDeposit, 'edit', {}), null);
  // Hand-typed rows keep full control.
  assert.equal(incomeWriteRefusal({ deposit_id: null }, 'delete'), null);
  assert.equal(incomeWriteRefusal({ deposit_id: null }, 'edit', { amount: 5 }), null);
  assert.equal(incomeWriteRefusal(null, 'delete'), null);
});
