import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixturePayload } from './fixtures';
import { RECAP_PAYLOAD_VERSION } from './payload';
import { announces, hasUnwatched, normalizeRow, promptPick, readyTitle, rowLabel, sortRows, type RecapRow } from './rows';

const row = (o: Partial<RecapRow> & Pick<RecapRow, 'id' | 'period_end'>): RecapRow => ({
  kind: 'week', period_start: '2026-09-21', income: 0, expenses: 0, net: 0,
  seen_at: null, prompted_at: null, created_at: '2026-10-01T15:00:00Z',
  payload: fixturePayload('normalWeek'), payload_version: RECAP_PAYLOAD_VERSION, ...o,
});
const TODAY = '2026-10-03';

test('prompt: newest unwatched, unprompted, recent, announcing recap', () => {
  const rows = [
    row({ id: 'old', period_end: '2026-09-20' }),
    row({ id: 'new', period_end: '2026-09-27' }),
  ];
  assert.equal(promptPick(rows, TODAY)?.id, 'new');
  assert.equal(promptPick([row({ id: 'a', period_end: '2026-09-27', prompted_at: 'x' })], TODAY), null);  // Later
  assert.equal(promptPick([row({ id: 'a', period_end: '2026-09-27', seen_at: 'x' })], TODAY), null);      // watched
  assert.equal(promptPick([row({ id: 'a', period_end: '2026-09-18' })], TODAY), null);                    // 15 days ago
  assert.equal(promptPick([row({ id: 'a', period_end: '2026-09-19' })], TODAY)?.id, 'a');                 // 14 days ago
  assert.equal(promptPick([row({ id: 'q', period_end: '2026-09-27', payload: fixturePayload('nothing') })], TODAY), null); // nothing at all
  assert.equal(promptPick([row({ id: 'v', period_end: '2026-09-27', payload_version: 99 })], TODAY), null);  // unknown shape
});

test('a month and a week ending the same day: the month comes first', () => {
  const rows = [row({ id: 'w', period_end: '2026-09-30' }), row({ id: 'm', kind: 'month', period_start: '2026-09-01', period_end: '2026-09-30' })];
  assert.deepEqual(sortRows(rows).map((r) => r.id), ['m', 'w']);
  assert.equal(promptPick(rows, TODAY)?.id, 'm');
});

test('Books dot: an unwatched recent recap, prompted or not', () => {
  assert.equal(hasUnwatched([row({ id: 'a', period_end: '2026-09-27', prompted_at: 'x' })], TODAY), true);
  assert.equal(hasUnwatched([row({ id: 'a', period_end: '2026-09-27', seen_at: 'x' })], TODAY), false);
  assert.equal(hasUnwatched([row({ id: 'a', period_end: '2026-09-01' })], TODAY), false);
  assert.equal(hasUnwatched([row({ id: 'q', period_end: '2026-09-27', payload: fixturePayload('nothing') })], TODAY), false);
});

test('labels and titles', () => {
  assert.equal(rowLabel({ kind: 'week', period_start: '2026-09-22', period_end: '2026-09-28' }), 'Week of Sep 22 – 28');
  assert.equal(rowLabel({ kind: 'week', period_start: '2026-09-29', period_end: '2026-10-05' }), 'Week of Sep 29 – Oct 5');
  assert.equal(rowLabel({ kind: 'month', period_start: '2026-09-01', period_end: '2026-09-30' }), 'September 2026');
  assert.equal(readyTitle({ kind: 'week', period_start: '2026-09-22' }), 'Your week is ready');
  assert.equal(readyTitle({ kind: 'month', period_start: '2026-09-01' }), 'Your September is ready');
});


test('history rows (no payload) announce from four payload fields', () => {
  const base = { id: 'h', kind: 'week', period_start: '2026-09-21', period_end: '2026-09-27', income: '0', expenses: '0', net: '0',
    seen_at: null, prompted_at: null, created_at: 'x', payload_version: RECAP_PAYLOAD_VERSION };
  const quiet = normalizeRow({ ...base, p_in: '0', p_out: '0', p_owed: '0', p_paid: '0' });
  assert.equal(quiet.nothing, true);
  assert.equal(announces(quiet), false);
  assert.equal('p_in' in quiet, false);
  const owedOnly = normalizeRow({ ...base, p_in: '0', p_out: '0', p_owed: '2', p_paid: null });
  assert.equal(announces(owedOnly), true);
  assert.equal(announces(normalizeRow({ ...base, p_in: '10', p_out: '0', p_owed: '0', p_paid: '0', payload_version: 99 })), false);
  assert.equal(announces(normalizeRow(base)), false);   // neither payload nor fields: unknown → no
});
