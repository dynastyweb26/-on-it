import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aiDailyLimitFor, aiLimitWindow } from './ai-limit';

const at = (iso: string) => new Date(iso);

// ── Window: local midnight → the next one ────────────────────────────────

test('window: UTC day is midnight to midnight', () => {
  const w = aiLimitWindow('UTC', at('2026-11-16T03:20:00Z'));
  assert.equal(w.since, '2026-11-16T00:00:00.000Z');
  assert.equal(w.resetsAt, '2026-11-17T00:00:00.000Z');
});

test('window: the midnight boundary — 23:59:59 still counts yesterday', () => {
  // New York is EST (UTC-5) on Nov 16, so local midnight is 05:00Z.
  const before = aiLimitWindow('America/New_York', at('2026-11-16T04:59:59Z'));
  assert.equal(before.since, '2026-11-15T05:00:00.000Z');
  assert.equal(before.resetsAt, '2026-11-16T05:00:00.000Z');

  const atMidnight = aiLimitWindow('America/New_York', at('2026-11-16T05:00:00Z'));
  assert.equal(atMidnight.since, '2026-11-16T05:00:00.000Z');
  assert.equal(atMidnight.resetsAt, '2026-11-17T05:00:00.000Z');
});

test('window: a 23-hour day (spring forward, US)', () => {
  // Mar 8 2026: midnight is EST (-5) = 05:00Z; next midnight is EDT (-4) = 04:00Z.
  const w = aiLimitWindow('America/New_York', at('2026-03-08T17:00:00Z'));
  assert.equal(w.since, '2026-03-08T05:00:00.000Z');
  assert.equal(w.resetsAt, '2026-03-09T04:00:00.000Z');
  assert.equal((Date.parse(w.resetsAt) - Date.parse(w.since)) / 3_600_000, 23);
});

test('window: a 25-hour day (fall back, US)', () => {
  // Nov 1 2026: midnight is EDT (-4) = 04:00Z; next midnight is EST (-5) = 05:00Z.
  const w = aiLimitWindow('America/New_York', at('2026-11-01T17:00:00Z'));
  assert.equal(w.since, '2026-11-01T04:00:00.000Z');
  assert.equal(w.resetsAt, '2026-11-02T05:00:00.000Z');
  assert.equal((Date.parse(w.resetsAt) - Date.parse(w.since)) / 3_600_000, 25);
});

test('window: a half-hour zone keeps its own midnight', () => {
  // Asia/Kolkata is UTC+5:30 all year: local midnight = 18:30Z the day before.
  const w = aiLimitWindow('Asia/Kolkata', at('2026-11-16T03:00:00Z'));
  assert.equal(w.since, '2026-11-15T18:30:00.000Z');
  assert.equal(w.resetsAt, '2026-11-16T18:30:00.000Z');
});

test('window: a missing or invalid timezone falls back to UTC', () => {
  for (const zone of [null, undefined, '', 'Mars/Olympus', 'not a zone']) {
    const w = aiLimitWindow(zone, at('2026-11-16T03:20:00Z'));
    assert.equal(w.since, '2026-11-16T00:00:00.000Z', String(zone));
    assert.equal(w.resetsAt, '2026-11-17T00:00:00.000Z', String(zone));
  }
});

test('window: the day after the last day of a month rolls over', () => {
  const w = aiLimitWindow('UTC', at('2026-11-30T23:00:00Z'));
  assert.equal(w.since, '2026-11-30T00:00:00.000Z');
  assert.equal(w.resetsAt, '2026-12-01T00:00:00.000Z');
});

// ── Decision ────────────────────────────────────────────────────────────

test('limit: free is 5 a day, and the fifth is the last one', () => {
  const now = at('2026-11-16T12:00:00Z');
  assert.equal(aiDailyLimitFor('free', null, 'UTC', now, 0).limit, 5);
  assert.equal(aiDailyLimitFor('free', null, 'UTC', now, 4).allowed, true);
  const spent = aiDailyLimitFor('free', null, 'UTC', now, 5);
  assert.equal(spent.allowed, false);
  assert.equal(spent.used, 5);
  assert.equal(spent.resetsAt, '2026-11-17T00:00:00.000Z');
});

test('limit: pro is 30, plus and founder are 100', () => {
  const now = at('2026-11-16T12:00:00Z');
  assert.equal(aiDailyLimitFor('active', 'pro', 'UTC', now, 29).allowed, true);
  assert.equal(aiDailyLimitFor('active', 'pro', 'UTC', now, 30).allowed, false);
  assert.equal(aiDailyLimitFor('active', 'plus', 'UTC', now, 99).allowed, true);
  assert.equal(aiDailyLimitFor('active', 'plus', 'UTC', now, 100).allowed, false);
  assert.equal(aiDailyLimitFor('founder', null, 'UTC', now, 100).limit, 100);
});

test('limit: a paid tier with no plan gets pro (not free, not plus)', () => {
  const now = at('2026-11-16T12:00:00Z');
  assert.equal(aiDailyLimitFor('trialing', null, 'UTC', now, 29).allowed, true);
  assert.equal(aiDailyLimitFor('trialing', null, 'UTC', now, 30).allowed, false);
});

test('limit: a canceled profile with a stored plan still counts as free', () => {
  const now = at('2026-11-16T12:00:00Z');
  const state = aiDailyLimitFor('canceled', 'plus', 'UTC', now, 5);
  assert.equal(state.limit, 5);
  assert.equal(state.allowed, false);
});

test('limit: the count is normalized (0 floor, fractional ceiling)', () => {
  const now = at('2026-11-16T12:00:00Z');
  assert.equal(aiDailyLimitFor('free', null, 'UTC', now, -3).used, 0);
  assert.equal(aiDailyLimitFor('free', null, 'UTC', now, 2.7).used, 2);
  assert.equal(aiDailyLimitFor('free', null, 'UTC', now, Number.NaN).used, 0);
});
