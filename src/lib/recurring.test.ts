import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, anchorFor, booksLine, CATCH_UP_CAP, dueDates, freshAutoLog, givesUpOnError, pausedAfterError, skipKey, skipNotices, daysBetween, firstDueFrom, monthlyTotal, nextDue, nextLine, normalizeRecurring,
  parseAmount, recurringSubtitle, shortDay, skipNotice, todayIn, upcoming, type Recurring,
} from './recurring';

const item = (x: Partial<Recurring>): Recurring => ({
  id: x.vendor ?? 'r', vendor: 'Adobe', description: null, amount: 54.99, category: 'subscriptions', cadence: 'monthly',
  anchor_day: 2, next_on: '2026-11-02', auto_log: true, last_logged_on: null, last_skipped_on: null, last_skip_reason: null, ...x,
});

test('nextDue: weekly, monthly, yearly', () => {
  assert.equal(nextDue('2026-10-06', 'weekly', null), '2026-10-13');
  assert.equal(nextDue('2026-12-30', 'weekly', null), '2027-01-06');
  assert.equal(nextDue('2026-11-02', 'monthly', 2), '2026-12-02');
  assert.equal(nextDue('2026-12-02', 'monthly', 2), '2027-01-02');
  assert.equal(nextDue('2026-11-02', 'yearly', 2), '2027-11-02');
});

test('nextDue: day 31 → last day, then back to 31', () => {
  assert.equal(nextDue('2027-01-31', 'monthly', 31), '2027-02-28');
  assert.equal(nextDue('2027-02-28', 'monthly', 31), '2027-03-31');
  assert.equal(nextDue('2027-03-31', 'monthly', 31), '2027-04-30');
  assert.equal(nextDue('2028-01-31', 'monthly', 31), '2028-02-29');  // leap year
  assert.equal(nextDue('2028-02-29', 'yearly', 29), '2029-02-28');
  assert.equal(nextDue('2029-02-28', 'yearly', 29), '2030-02-28');
  assert.equal(nextDue('2031-02-28', 'yearly', 29), '2032-02-29');
});

test('anchorFor + firstDueFrom (resume never back-fills)', () => {
  assert.equal(anchorFor('weekly', '2026-11-02'), null);
  assert.equal(anchorFor('monthly', '2026-10-31'), 31);
  assert.equal(firstDueFrom('2026-07-31', 'monthly', 31, '2026-10-08'), '2026-10-31');
  assert.equal(firstDueFrom('2026-10-08', 'monthly', 8, '2026-10-08'), '2026-10-08');
  assert.equal(firstDueFrom('2026-09-01', 'weekly', null, '2026-10-08'), '2026-10-13');
});

test('addDays / daysBetween across months and years', () => {
  assert.equal(addDays('2026-12-25', 13), '2027-01-07');
  assert.equal(daysBetween('2026-09-02', '2026-10-03'), 31);
});

test('monthlyTotal: weekly × 52 / 12, yearly / 12, paused included', () => {
  assert.equal(monthlyTotal([
    item({ amount: 54.99 }), item({ cadence: 'weekly', amount: 60 }), item({ cadence: 'yearly', amount: 120 }),
    item({ amount: 10, auto_log: false }),
  ]), Math.round((54.99 + 260 + 10 + 10) * 100) / 100);
});

test('upcoming: next 14 local days, weekly repeats, sorted', () => {
  const list = upcoming([
    item({ vendor: 'Corner Fuel', cadence: 'weekly', anchor_day: null, next_on: '2026-10-06', amount: 60 }),
    item({ vendor: 'Brightwave', next_on: '2026-10-18', anchor_day: 18, amount: 65 }),
    item({ vendor: 'Adobe', next_on: '2026-11-02' }),
  ], '2026-10-06');
  assert.deepEqual(list.map((u) => `${u.date} ${u.item.vendor}`), [
    '2026-10-06 Corner Fuel', '2026-10-13 Corner Fuel', '2026-10-18 Brightwave',
  ]);
  // A past next_on (the cron is behind) projects from today on.
  assert.deepEqual(upcoming([item({ next_on: '2026-09-02' })], '2026-10-06', 30).map((u) => u.date), ['2026-11-02']);
});

test('display lines', () => {
  assert.equal(shortDay('2026-11-02', '2026-10-08'), 'Nov 2');
  assert.equal(shortDay('2027-01-02', '2026-10-08'), 'Jan 2, 2027');
  assert.equal(recurringSubtitle({ category: 'phone', cadence: 'monthly' }), 'Phone · Monthly');
  assert.equal(nextLine(item({}), '2026-10-08'), 'Next Nov 2');
  assert.equal(nextLine(item({ auto_log: false }), '2026-10-08'), 'Paused');
});

test('skipNotice: only until a later charge is logged', () => {
  assert.equal(skipNotice(item({ vendor: 'Rent', last_skipped_on: '2026-10-01', last_skip_reason: 'free_limit' })),
    'Couldn’t log Rent, free limit reached');
  assert.equal(skipNotice(item({ vendor: 'Rent', last_skipped_on: '2026-10-01', last_skip_reason: 'error' })),
    'Couldn’t log Rent on Oct 1');
  assert.equal(skipNotice(item({ last_skipped_on: '2026-10-01', last_skip_reason: 'free_limit', last_logged_on: '2026-11-01' })), null);
  assert.equal(skipNotice(item({})), null);
});

test('normalizeRecurring: cleans DB rows', () => {
  const r = normalizeRecurring({ id: 'x', vendor: 'Rent', amount: '1200.00', category: 'software', cadence: 'daily', next_on: '2026-11-01', auto_log: null, last_skip_reason: 'nope' });
  assert.equal(r.amount, 1200); assert.equal(r.category, 'other'); assert.equal(r.cadence, 'monthly');
  assert.equal(r.auto_log, true); assert.equal(r.last_skip_reason, null);
});

test('parseAmount', () => {
  assert.equal(parseAmount('$1,200.50'), 1200.5);
  assert.equal(parseAmount(''), null);
  assert.ok(Number.isNaN(parseAmount('0')));
  assert.ok(Number.isNaN(parseAmount('12.345')));
  assert.ok(Number.isNaN(parseAmount('abc')));
});

test('todayIn: zone-local date, UTC fallback', () => {
  const at = new Date('2026-10-09T03:00:00Z');
  assert.equal(todayIn('America/Chicago', at), '2026-10-08');
  assert.equal(todayIn('Asia/Tokyo', at), '2026-10-09');
  assert.equal(todayIn(null, at), '2026-10-09');
  assert.equal(todayIn('Not/AZone', at), '2026-10-09');
});

test('booksLine: count, next live charge, monthly total', () => {
  assert.deepEqual(booksLine([], '2026-10-06'), { caption: 'Rent, software, insurance — set once', monthly: null });
  assert.deepEqual(booksLine([
    item({ next_on: '2026-11-02' }), item({ cadence: 'weekly', anchor_day: null, next_on: '2026-10-06', amount: 60 }),
    item({ next_on: '2026-10-07', auto_log: false, amount: 10 }),
  ], '2026-10-06'), { caption: '3 charges · next Oct 6', monthly: Math.round((54.99 + 260 + 10) * 100) / 100 });
  assert.equal(booksLine([item({ auto_log: false })], '2026-10-06').caption, '1 charge · all paused');
});

test('skipNotices: active ones, newest first', () => {
  assert.deepEqual(skipNotices([
    item({ id: 'a', vendor: 'Rent', last_skipped_on: '2026-10-01', last_skip_reason: 'free_limit' }),
    item({ id: 'b', vendor: 'Gym', last_skipped_on: '2026-10-05', last_skip_reason: 'error' }),
    item({ id: 'c', vendor: 'Ok', last_skipped_on: '2026-09-01', last_skip_reason: 'free_limit', last_logged_on: '2026-10-01' }),
  ]).map((n) => n.id), ['b', 'a']);
});

test('skipNotice: paused after the cron gave up on an error', () => {
  const stuck = item({ vendor: 'Gym', auto_log: false, last_skipped_on: '2026-10-06', last_skip_reason: 'error' });
  assert.equal(pausedAfterError(stuck), true);
  assert.equal(skipNotice(stuck), 'Paused after Gym couldn’t log on Oct 6. Add it manually or turn auto-log back on.');
  assert.equal(skipNotice(stuck, true), 'Paused, couldn’t log on Oct 6');
  // Auto-log back on: a plain error notice until a later charge logs.
  assert.equal(skipNotice({ ...stuck, auto_log: true }), 'Couldn’t log Gym on Oct 6');
  assert.equal(pausedAfterError({ ...stuck, auto_log: true }), false);
  // Paused by hand after a free-limit skip: not the error copy.
  assert.equal(pausedAfterError({ ...stuck, last_skip_reason: 'free_limit' }), false);
  assert.equal(skipNotice({ ...stuck, last_logged_on: '2026-10-06' }), null);
});

test('skipNotices: paused flag, item, and hidden (added by hand on this device)', () => {
  const stuck = item({ id: 'g', vendor: 'Gym', auto_log: false, last_skipped_on: '2026-10-06', last_skip_reason: 'error' });
  const rent = item({ id: 'a', vendor: 'Rent', last_skipped_on: '2026-10-01', last_skip_reason: 'free_limit' });
  const all = skipNotices([stuck, rent]);
  assert.deepEqual(all.map((n) => [n.id, n.paused]), [['g', true], ['a', false]]);
  assert.equal(all[0].item, stuck);
  assert.equal(skipKey(stuck), 'g:2026-10-06');
  assert.deepEqual(skipNotices([stuck, rent], new Set(['g:2026-10-06'])).map((n) => n.id), ['a']);
  // A later skip on the same item is a new key: it shows again.
  assert.equal(skipNotices([{ ...stuck, last_skipped_on: '2026-11-06' }], new Set(['g:2026-10-06'])).length, 1);
});

test('freshAutoLog: recurring rows created in the last 24 h', () => {
  const now = Date.parse('2026-10-08T15:00:00Z');
  assert.equal(freshAutoLog({ recurring_id: 'r', created_at: '2026-10-08T14:00:00Z' }, now), true);
  assert.equal(freshAutoLog({ recurring_id: 'r', created_at: '2026-10-07T14:00:00Z' }, now), false);
  assert.equal(freshAutoLog({ recurring_id: null, created_at: '2026-10-08T14:00:00Z' }, now), false);
});

test('dueDates: nothing due before next_on; today itself is due', () => {
  assert.deepEqual(dueDates('2026-10-09', 'monthly', 9, '2026-10-08', '2026-10-01').dates, []);
  assert.deepEqual(dueDates('2026-10-08', 'monthly', 8, '2026-10-08', '2026-10-01'), { start: '2026-10-08', dates: ['2026-10-08'] });
});

test('dueDates: catch-up after missed runs, oldest first, anchor 31 across short months', () => {
  assert.deepEqual(dueDates('2026-01-31', 'monthly', 31, '2026-04-30', '2026-01-01').dates,
    ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  assert.deepEqual(dueDates('2028-01-29', 'monthly', 29, '2028-03-29', '2028-01-01').dates,
    ['2028-01-29', '2028-02-29', '2028-03-29']);
  assert.deepEqual(dueDates('2026-01-30', 'monthly', 30, '2026-03-30', '2026-01-01').dates,
    ['2026-01-30', '2026-02-28', '2026-03-30']);
});

test('dueDates: Feb 29 yearly → Feb 28, back to the 29th in a leap year', () => {
  assert.deepEqual(dueDates('2028-02-29', 'yearly', 29, '2032-03-01', '2028-01-01').dates,
    ['2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29']);
});

test('dueDates: at most CATCH_UP_CAP per run', () => {
  const r = dueDates('2026-01-05', 'weekly', null, '2026-10-08', '2026-01-01');
  assert.equal(r.dates.length, CATCH_UP_CAP);
  assert.equal(r.dates[0], '2026-01-05');
  assert.equal(r.dates[CATCH_UP_CAP - 1], '2026-03-23');
});

test('dueDates: never a date before the item was created', () => {
  // next_on somehow before creation: skipped forward, not logged.
  assert.deepEqual(dueDates('2026-09-01', 'monthly', 1, '2026-10-08', '2026-09-15'), { start: '2026-10-01', dates: ['2026-10-01'] });
  // Created today with next_on today: due.
  assert.deepEqual(dueDates('2026-10-08', 'weekly', null, '2026-10-08', '2026-10-08').dates, ['2026-10-08']);
  // Floor moves start even when nothing is due yet.
  assert.deepEqual(dueDates('2026-09-01', 'monthly', 1, '2026-09-20', '2026-09-15'), { start: '2026-10-01', dates: [] });
});

test('dueDates: owner-local today and created day (zone ahead of UTC)', () => {
  const run = new Date('2026-10-08T15:00:00Z'); // the cron's 15:00 UTC
  const today = todayIn('Pacific/Auckland', run); // already Oct 9 there
  assert.equal(today, '2026-10-09');
  const createdOn = todayIn('Pacific/Auckland', new Date('2026-10-08T12:30:00Z')); // created Oct 9 local
  assert.deepEqual(dueDates('2026-10-09', 'weekly', null, today, createdOn).dates, ['2026-10-09']);
  assert.deepEqual(dueDates('2026-10-09', 'weekly', null, todayIn('America/Chicago', run), '2026-10-08').dates, []);
});

test('givesUpOnError: stuck on D, D+1 retry; D+2 gives up', () => {
  assert.equal(givesUpOnError('2026-10-06', '2026-10-06'), false);
  assert.equal(givesUpOnError('2026-10-06', '2026-10-07'), false);
  assert.equal(givesUpOnError('2026-10-06', '2026-10-08'), true);
  assert.equal(givesUpOnError('2026-09-01', '2026-10-08'), true); // a catch-up date already 3+ days old
});
