// The invoice-detail record-payment sheet must hand recordPayment exactly the
// amount, method and paid_at the old inline form produced. These tests pin the
// sheet's selection → input mapping, including Today/Yesterday built in LOCAL
// time (America/Chicago) at an evening hour where the UTC date differs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PAYMENT_METHODS,
  buildRecordPayment,
  localDateToIso,
  methodLabel,
  payAmountValue,
  payDateYmd,
  yesterdayString,
  type PaymentMethod,
} from '@/lib/record-payment';

// Node re-reads process.env.TZ on each Date use, so setting it here (after the
// imports, which build no Dates) is enough to make the tests timezone-stable.
process.env.TZ = 'America/Chicago';

test('the six payment methods match the existing union and labels', () => {
  assert.deepEqual(PAYMENT_METHODS.map((m) => m.value), ['zelle', 'cash', 'check', 'card', 'bank', 'other']);
  assert.equal(methodLabel('bank'), 'Bank transfer');
  assert.equal(methodLabel('other'), 'Other');
});

test('payAmountValue matches the old inline form for every mode', () => {
  // full / deposit pre-fill exactly what the old <select> set the input to.
  assert.equal(payAmountValue('full', '', 80, 20), 80);
  assert.equal(payAmountValue('deposit', '', 80, 20), 20);
  // other is Number(text) > 0 — including the old un-rounded decimal case.
  assert.equal(payAmountValue('other', '12', 80, 20), 12);
  assert.equal(payAmountValue('other', '12.345', 80, 20), 12.345);
  // blank / zero / non-numeric save nothing (old Save was disabled).
  assert.equal(payAmountValue('other', '', 80, 20), 0);
  assert.equal(payAmountValue('other', '0', 80, 20), 0);
  assert.equal(payAmountValue('other', 'abc', 80, 20), 0);
});

test('Today/Yesterday are LOCAL calendar days when UTC is already tomorrow', () => {
  // 04:30 UTC on Oct 20 is 23:30 on Oct 19 in Chicago (CDT, UTC-5).
  const evening = new Date('2026-10-20T04:30:00.000Z');
  assert.equal(payDateYmd('today', '', evening), '2026-10-19');
  assert.equal(payDateYmd('yesterday', '', evening), '2026-10-18');
  assert.equal(localDateToIso(payDateYmd('today', '', evening)), '2026-10-19T05:00:00.000Z');
  assert.equal(localDateToIso(payDateYmd('yesterday', '', evening)), '2026-10-18T05:00:00.000Z');
});

test('Today uses the standard-time offset too (CST, UTC-6)', () => {
  // 06:30 UTC on Jan 15 is 00:30 on Jan 15 in Chicago (CST, UTC-6).
  const midnightish = new Date('2026-01-15T06:30:00.000Z');
  assert.equal(payDateYmd('today', '', midnightish), '2026-01-15');
  assert.equal(localDateToIso(payDateYmd('today', '', midnightish)), '2026-01-15T06:00:00.000Z');
});

test('a picked "Other day" wins over the now-based modes', () => {
  const now = new Date('2026-10-20T04:30:00.000Z');
  assert.equal(payDateYmd('other', '2026-09-30', now), '2026-09-30');
});

test('buildRecordPayment passes amount, method and paid_at to recordPayment', () => {
  const now = new Date('2026-10-20T04:30:00.000Z'); // Oct 19, 23:30 Chicago
  // Paid in full, cash, today — the sheet's default 2-tap path.
  assert.deepEqual(
    buildRecordPayment({
      mode: 'full', amountText: '', balance: 80, depositRemaining: 20,
      method: 'cash', dateMode: 'today', pickedDate: '', now,
    }),
    { amount: 80, method: 'cash', paidAt: '2026-10-19T05:00:00.000Z' },
  );
  // Deposit still due, Zelle, yesterday.
  assert.deepEqual(
    buildRecordPayment({
      mode: 'deposit', amountText: '', balance: 80, depositRemaining: 20,
      method: 'zelle', dateMode: 'yesterday', pickedDate: '', now,
    }),
    { amount: 20, method: 'zelle', paidAt: '2026-10-18T05:00:00.000Z' },
  );
  // Other amount, bank transfer, a picked day.
  assert.deepEqual(
    buildRecordPayment({
      mode: 'other', amountText: '12.5', balance: 80, depositRemaining: 0,
      method: 'bank', dateMode: 'other', pickedDate: '2026-09-30', now,
    }),
    { amount: 12.5, method: 'bank', paidAt: '2026-09-30T05:00:00.000Z' },
  );
});

test('every method value survives the build unchanged', () => {
  const now = new Date('2026-10-20T04:30:00.000Z');
  for (const { value } of PAYMENT_METHODS) {
    const input = buildRecordPayment({
      mode: 'other', amountText: '5', balance: 80, depositRemaining: 0,
      method: value as PaymentMethod, dateMode: 'today', pickedDate: '', now,
    });
    assert.equal(input.method, value);
  }
});

test('yesterdayString steps the calendar day back locally', () => {
  // 00:30 Chicago on Jan 1 → yesterday is Dec 31 of the prior year.
  assert.equal(yesterdayString(new Date('2026-01-01T06:30:00.000Z')), '2025-12-31');
});
