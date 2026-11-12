import test from 'node:test';
import assert from 'node:assert/strict';
import { booksDay, inBooksPeriod } from './books-period';

const OCT = { start: '2026-10-01', end: '2026-10-31' };

test('an expense uses its bare spent_on date, with inclusive bounds', () => {
  assert.equal(booksDay('expense', '2026-10-01'), '2026-10-01');
  assert.equal(booksDay('expense', '2026-10-31'), '2026-10-31');
  assert.equal(inBooksPeriod('2026-10-01', OCT), true);
  assert.equal(inBooksPeriod('2026-10-31', OCT), true);
  assert.equal(inBooksPeriod('2026-09-30', OCT), false);
  assert.equal(inBooksPeriod('2026-11-01', OCT), false);
});

test('a payment uses paid_at in the supplied zone, first and last day inclusive', () => {
  const tz = 'America/Chicago';
  assert.equal(booksDay('payment', '2026-10-01T05:00:00Z', tz), '2026-10-01');
  assert.equal(booksDay('payment', '2026-11-01T04:59:00Z', tz), '2026-10-31');
  assert.equal(inBooksPeriod(booksDay('payment', '2026-11-01T04:59:00Z', tz), OCT), true);
  assert.equal(inBooksPeriod(booksDay('payment', '2026-11-01T05:00:00Z', tz), OCT), false);
});

test('a payment just after local midnight is the next day, not the last day', () => {
  const tz = 'America/Chicago';
  assert.equal(booksDay('payment', '2026-11-01T05:00:00Z', tz), '2026-11-01');
  assert.equal(booksDay('payment', '2026-11-01T05:01:00Z', tz), '2026-11-01');
  assert.equal(inBooksPeriod(booksDay('payment', '2026-11-01T05:01:00Z', tz), OCT), false);
});

test('other income uses received_on at noon UTC, as Books does', () => {
  assert.equal(booksDay('other_income', '2026-10-01', 'UTC'), '2026-10-01');
  assert.equal(booksDay('other_income', '2026-10-01', 'America/Chicago'), '2026-10-01');
  // Noon UTC is already the next local day at UTC+14.
  assert.equal(booksDay('other_income', '2026-10-01', 'Pacific/Kiritimati'), '2026-10-02');
});

test('all time has no bounds', () => {
  assert.equal(inBooksPeriod('anything', { ...OCT, granularity: 'all' }), true);
  assert.equal(inBooksPeriod('', { ...OCT, granularity: 'all' }), true);
});
