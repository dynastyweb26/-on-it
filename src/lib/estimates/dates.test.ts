import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDaysToDateString,
  calendarDaysBetween,
  defaultValidUntil,
  endOfDayInstant,
  isDateOnly,
  isOnOrAfterToday,
  parseDateOnly,
  resolveTimeZone,
  todayInTimeZone,
} from './dates';

const CHI = 'America/Chicago';
const at = (iso: string) => new Date(iso);

test('a bad or missing timezone falls back to America/Chicago', () => {
  assert.equal(resolveTimeZone(null), CHI);
  assert.equal(resolveTimeZone(''), CHI);
  assert.equal(resolveTimeZone('Not/AZone'), CHI);
  assert.equal(resolveTimeZone('America/New_York'), 'America/New_York');
});

test('expiry is local midnight after the date (standard time)', () => {
  assert.equal(endOfDayInstant('2026-01-15', CHI)?.toISOString(), '2026-01-16T06:00:00.000Z');
});

test('expiry is local midnight after the date (daylight time)', () => {
  assert.equal(endOfDayInstant('2026-10-23', CHI)?.toISOString(), '2026-10-24T05:00:00.000Z');
});

test('DST spring forward: the last day ends at 05:00Z', () => {
  assert.equal(endOfDayInstant('2026-03-08', CHI)?.toISOString(), '2026-03-09T05:00:00.000Z');
});

test('DST fall back: the last day ends at 06:00Z', () => {
  assert.equal(endOfDayInstant('2026-11-01', CHI)?.toISOString(), '2026-11-02T06:00:00.000Z');
});

test('the calendar date is the business-local one', () => {
  assert.equal(todayInTimeZone(at('2026-10-23T04:30:00Z'), CHI), '2026-10-22');
  assert.equal(todayInTimeZone(at('2026-10-23T05:00:00Z'), CHI), '2026-10-23');
});

test('date-only parsing rejects impossible dates', () => {
  assert.equal(parseDateOnly('2026-02-31'), null);
  assert.equal(isDateOnly('2026-02-31'), false);
  assert.equal(isDateOnly('2026-02-28'), true);
  assert.equal(isDateOnly('2026-2-8'), false);
});

test('add days and calendar differences are UTC-date math', () => {
  assert.equal(addDaysToDateString('2026-10-23', 30), '2026-11-22');
  assert.equal(addDaysToDateString('2026-12-20', 30), '2027-01-19');
  assert.equal(calendarDaysBetween('2026-10-20', '2026-10-23'), 3);
  assert.equal(calendarDaysBetween('2026-10-23', '2026-10-23'), 0);
});

test('a requested expiry must be today or later locally', () => {
  const now = at('2026-10-23T12:00:00Z'); // Oct 23 in Chicago
  assert.equal(isOnOrAfterToday('2026-10-23', now, CHI), true);
  assert.equal(isOnOrAfterToday('2026-10-24', now, CHI), true);
  assert.equal(isOnOrAfterToday('2026-10-22', now, CHI), false);
});

test('the default expiry uses the business-local today + 30', () => {
  assert.equal(defaultValidUntil(at('2026-10-23T12:00:00Z'), CHI), '2026-11-22');
  // 23:30 local on Oct 22, even though UTC is already Oct 23.
  assert.equal(defaultValidUntil(at('2026-10-23T04:30:00Z'), CHI), '2026-11-21');
});
