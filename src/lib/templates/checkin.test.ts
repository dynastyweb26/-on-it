// RULES.md §6, item 4, with the storage the existing feedback prompt already
// uses. The 30-day window applies to both being asked and having submitted.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHECKIN_INTERVAL_MS,
  checkInDecision,
  checkInStateFrom,
  markCheckInAsked,
  submittedAtFrom,
  type CheckInContext,
} from './checkin';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 12, 12);
const ctx = (over: Partial<CheckInContext> = {}): CheckInContext => ({
  now: NOW,
  lastAskedAt: null,
  lastSubmittedAt: null,
  midTask: false,
  ...over,
});

test('a new user is eligible', () => {
  assert.deepEqual(checkInDecision(ctx()), { show: true, nextEligibleAt: NOW });
});

test('never mid-task, even on a first-ever ask', () => {
  assert.deepEqual(checkInDecision(ctx({ midTask: true })), {
    show: false,
    reason: 'mid_task',
    nextEligibleAt: NOW,
  });
});

test('at most once every 30 days', () => {
  const asked29 = checkInDecision(ctx({ lastAskedAt: NOW - 29 * DAY }));
  assert.equal(asked29.show, false);
  assert.equal(asked29.show === false && asked29.reason, 'asked_recently');
  assert.equal(asked29.nextEligibleAt, NOW + DAY);

  const asked30 = checkInDecision(ctx({ lastAskedAt: NOW - 30 * DAY }));
  assert.equal(asked30.show, true);

  assert.equal(CHECKIN_INTERVAL_MS, 30 * DAY);
});

test('skip anyone who submitted feedback in the last 30 days', () => {
  const recent = checkInDecision(ctx({ lastSubmittedAt: NOW - 10 * DAY }));
  assert.equal(recent.show, false);
  assert.equal(recent.show === false && recent.reason, 'submitted_recently');
  assert.equal(recent.nextEligibleAt, NOW + 20 * DAY);

  assert.equal(checkInDecision(ctx({ lastSubmittedAt: NOW - 30 * DAY })).show, true);
});

test('the later of the two windows is what to wait for', () => {
  const d = checkInDecision(
    ctx({ lastAskedAt: NOW - 20 * DAY, lastSubmittedAt: NOW - 5 * DAY }),
  );
  assert.equal(d.show, false);
  assert.equal(d.nextEligibleAt, NOW + 25 * DAY);
});

test('marking it asked updates only lastShownAt', () => {
  const before = { lastShownAt: null, snoozedUntil: NOW + DAY, dismissals: 1 };
  assert.deepEqual(markCheckInAsked(before, NOW), {
    lastShownAt: NOW,
    snoozedUntil: NOW + DAY,
    dismissals: 1,
  });
  assert.equal(checkInDecision(ctx({ lastAskedAt: NOW })).show, false);
});

test('the existing prompt storage is what is read back', () => {
  const stored = JSON.stringify({ lastShownAt: NOW - 2 * DAY, snoozedUntil: null, dismissals: 2 });
  assert.deepEqual(checkInStateFrom(stored), {
    lastShownAt: NOW - 2 * DAY,
    snoozedUntil: null,
    dismissals: 2,
  });
  assert.deepEqual(checkInStateFrom('not json'), {
    lastShownAt: null,
    snoozedUntil: null,
    dismissals: 0,
  });
  assert.deepEqual(checkInStateFrom(null), {
    lastShownAt: null,
    snoozedUntil: null,
    dismissals: 0,
  });
});

test('a feedback row timestamp reads from Postgres and from Supabase text', () => {
  assert.equal(submittedAtFrom(new Date(NOW)), NOW);
  assert.equal(submittedAtFrom('2026-11-12T12:00:00.000Z'), NOW);
  assert.equal(submittedAtFrom(null), null);
  assert.equal(submittedAtFrom('not a date'), null);
});
