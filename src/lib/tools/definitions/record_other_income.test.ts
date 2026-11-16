// The row this tool writes must be the unattached route's row: same parser,
// same default title, same classification, same key rule. These tests hold that
// and the one-row-per-confirm promise.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureDb } from '../fixture-db';
import { fixtureWriteDb } from '../write-fixture';
import { recordOtherIncomeTool, RecordOtherIncomeInput } from './record_other_income';

const OWNER = '11111111-1111-1111-1111-111111111111';

const account = () => ({
  profiles: [{ id: OWNER, timezone: 'America/Chicago' }],
  other_income: [],
});

const prepare = (rows: Record<string, unknown>, args: unknown) =>
  recordOtherIncomeTool.prepare!(
    { db: fixtureDb(rows as never), userId: OWNER },
    RecordOtherIncomeInput.parse(args),
  );

test('no name means the neutral title, and the card prints the amount', async () => {
  const prepared = await prepare(account(), { amount: 150, method: 'cash' });

  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  const resolved = prepared.resolved as { title: string; method: string };
  assert.equal(resolved.title, 'Other income');
  // A manual cash payment is recorded as other, exactly like the sheet.
  assert.equal(resolved.method, 'other');
  assert.equal(prepared.row.amount, '$150.00');
});

test('a future day is refused', async () => {
  const prepared = await prepare(account(), { amount: 150, received_on: '2999-01-01' });

  assert.equal(prepared.ok, false);
  if (prepared.ok) return;
  assert.match(prepared.problem, /has not happened yet/);
});

test('the same action id confirms once, as the unattached route stores it', async () => {
  const wdb = fixtureWriteDb(account() as never, OWNER);
  const prepared = await recordOtherIncomeTool.prepare!(
    { db: wdb, userId: OWNER },
    RecordOtherIncomeInput.parse({ amount: 150, title: 'Side job', method: 'zelle' }),
  );
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;

  const ctx = { db: wdb, userId: OWNER };
  const first = await recordOtherIncomeTool.execute!(ctx, prepared.resolved, 'act-9');
  assert.equal(first.ok, true);
  assert.equal(wdb.rows.other_income?.length, 1);

  const second = await recordOtherIncomeTool.execute!(ctx, prepared.resolved, 'act-9');
  assert.equal(second.ok, false);
  assert.equal(wdb.rows.other_income?.length, 1, 'a replay wrote a second row');

  const row = wdb.rows.other_income![0] as Record<string, unknown>;
  assert.equal(row.classification, 'other_income');
  assert.equal(row.title, 'Side job');
  assert.equal(row.method, 'zelle');
  assert.equal(row.idempotency_key, 'ai-act-9');
  assert.equal(row.deposit_id, null);
});
