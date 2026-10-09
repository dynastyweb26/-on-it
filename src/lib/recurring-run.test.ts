import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCapRefusal, runItem, type ChargeResult, type CronItem } from './recurring-run';

const item = (x: Partial<CronItem>): CronItem => ({
  id: 'r1', user_id: 'u1', vendor: 'Rent', description: null, amount: 1200, category: 'other', cadence: 'monthly',
  anchor_day: 1, next_on: '2026-10-01', created_at: '2026-09-01T12:00:00Z', ...x,
});

/** A fake insert: answers per date, records what was tried. */
const db = (answers: Record<string, ChargeResult> = {}) => {
  const tried: string[] = [];
  return { tried, log: async (on: string) => { tried.push(on); return answers[on] ?? 'logged'; } };
};

test('runItem: not due in the owner date → nothing tried, no patch', async () => {
  const d = db();
  const r = await runItem(item({ next_on: '2026-10-09' }), '2026-10-08', '2026-09-01', d.log);
  assert.deepEqual(d.tried, []);
  assert.equal(r.patch, null);
  assert.equal(r.due, false);
});

test('runItem: logs today and advances next_on', async () => {
  const d = db();
  const r = await runItem(item({}), '2026-10-01', '2026-09-01', d.log);
  assert.deepEqual(d.tried, ['2026-10-01']);
  assert.deepEqual(r.patch, { next_on: '2026-11-01', last_logged_on: '2026-10-01' });
  assert.equal(r.logged, 1);
});

test('runItem: catch-up logs every missed date oldest first', async () => {
  const d = db();
  const r = await runItem(item({ next_on: '2026-08-01' }), '2026-10-08', '2026-07-01', d.log);
  assert.deepEqual(d.tried, ['2026-08-01', '2026-09-01', '2026-10-01']);
  assert.deepEqual(r.patch, { next_on: '2026-11-01', last_logged_on: '2026-10-01' });
});

test('runItem: free limit skips that date for good, stops the run, no pause', async () => {
  const d = db({ '2026-09-01': 'free_limit' });
  const r = await runItem(item({ next_on: '2026-08-01' }), '2026-10-08', '2026-07-01', d.log);
  assert.deepEqual(d.tried, ['2026-08-01', '2026-09-01']); // Oct 1 not attempted this run
  assert.equal(r.skip, 'free_limit');
  assert.equal(r.pause, false);
  assert.deepEqual(r.patch, {
    next_on: '2026-10-01', last_logged_on: '2026-08-01', last_skipped_on: '2026-09-01', last_skip_reason: 'free_limit',
  });
});

test('runItem: free limit on today moves next_on to the next charge', async () => {
  const r = await runItem(item({}), '2026-10-01', '2026-09-01', db({ '2026-10-01': 'free_limit' }).log);
  assert.deepEqual(r.patch, { next_on: '2026-11-01', last_skipped_on: '2026-10-01', last_skip_reason: 'free_limit' });
});

test('runItem: error keeps next_on for a retry, days 1–2; day 3 pauses', async () => {
  const fail = { '2026-10-06': 'error' } as const;
  const it = item({ vendor: 'Gym', cadence: 'weekly', anchor_day: null, next_on: '2026-10-06' });
  for (const [today, pause] of [['2026-10-06', false], ['2026-10-07', false], ['2026-10-08', true]] as const) {
    const r = await runItem(it, today, '2026-09-01', db(fail).log);
    assert.equal(r.skip, 'error');
    assert.equal(r.pause, pause, today);
    assert.deepEqual(r.patch, {
      next_on: '2026-10-06', last_skipped_on: '2026-10-06', last_skip_reason: 'error', ...(pause ? { auto_log: false } : {}),
    });
  }
});

test('runItem: error after a logged date keeps both stamps; later dates wait', async () => {
  const d = db({ '2026-09-01': 'error' });
  const r = await runItem(item({ next_on: '2026-08-01' }), '2026-09-02', '2026-07-01', d.log);
  assert.deepEqual(d.tried, ['2026-08-01', '2026-09-01']);
  assert.deepEqual(r.patch, { next_on: '2026-09-01', last_logged_on: '2026-08-01', last_skipped_on: '2026-09-01', last_skip_reason: 'error' });
});

test('runItem: never before the created day; the floor alone still moves next_on', async () => {
  const d = db();
  const r = await runItem(item({ next_on: '2026-09-01' }), '2026-09-20', '2026-09-15', d.log);
  assert.deepEqual(d.tried, []);
  assert.deepEqual(r.patch, { next_on: '2026-10-01' });
});

test('isCapRefusal: only the cap trigger', () => {
  assert.equal(isCapRefusal({ code: 'P0001', hint: 'PAYWALL_LIMIT_EXPENSE' }), true);
  assert.equal(isCapRefusal({ code: 'P0001', hint: 'PAYWALL_LIMIT_INVOICE' }), false);
  assert.equal(isCapRefusal({ code: '23505' }), false);
  assert.equal(isCapRefusal(null), false);
});
