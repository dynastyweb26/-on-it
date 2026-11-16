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

const client = (id: string, name: string) => ({
  id, user_id: OWNER, name, phone: null, email: null, address: null, deleted_at: null,
});

const withRuth = () => ({ ...account(), clients: [client('cli-ruth', 'Ruth Lawrence')] });
const withTwoRuths = () => ({
  ...account(),
  clients: [client('cli-chen', 'Ruth Chen'), client('cli-law', 'Ruth Lawrence')],
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

test('a payer and no title records the payer as the title and the client', async () => {
  const prepared = await prepare(withRuth(), { amount: 100, payer: 'ruth' });

  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  const resolved = prepared.resolved as { clientName: string | null; title: string };
  assert.equal(resolved.clientName, 'Ruth Lawrence');
  assert.equal(resolved.title, 'Ruth Lawrence');
  assert.equal(prepared.row.summary, 'Record income from Ruth Lawrence');
});

test('a typed title wins over the payer, and the payer is still saved', async () => {
  const prepared = await prepare(withRuth(), { amount: 100, payer: 'ruth', title: 'Deck repair' });

  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  const resolved = prepared.resolved as { clientName: string | null; title: string };
  assert.equal(resolved.title, 'Deck repair');
  assert.equal(resolved.clientName, 'Ruth Lawrence');
});

test('a payer that matches several clients is a question, with no figures', async () => {
  const prepared = await prepare(withTwoRuths(), { amount: 100, payer: 'ruth' });

  assert.equal(prepared.ok, false);
  if (prepared.ok) return;
  assert.match(prepared.problem, /More than one client matches "ruth"/);
  assert.ok(prepared.problem.includes('Ruth Chen'));
  assert.ok(prepared.problem.includes('Ruth Lawrence'));
  assert.equal(prepared.problem.includes('$'), false);
});

test('a payer nobody on file has is kept as said', async () => {
  const prepared = await prepare(withRuth(), { amount: 100, payer: 'Zebediah' });

  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  const resolved = prepared.resolved as { clientName: string | null; title: string };
  assert.equal(resolved.clientName, 'Zebediah');
  assert.equal(resolved.title, 'Zebediah');
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
  assert.equal(row.client_name, null, 'no payer was given');
  assert.equal(row.method, 'zelle');
  assert.equal(row.idempotency_key, 'ai-act-9');
  assert.equal(row.deposit_id, null);
});

test('the saved row keeps the payer the card named', async () => {
  const wdb = fixtureWriteDb(withRuth() as never, OWNER);
  const prepared = await recordOtherIncomeTool.prepare!(
    { db: wdb, userId: OWNER },
    RecordOtherIncomeInput.parse({ amount: 90, payer: 'ruth' }),
  );
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;

  const outcome = await recordOtherIncomeTool.execute!({ db: wdb, userId: OWNER }, prepared.resolved, 'act-10');
  assert.equal(outcome.ok, true);

  const row = wdb.rows.other_income![0] as Record<string, unknown>;
  assert.equal(row.client_name, 'Ruth Lawrence');
  assert.equal(row.title, 'Ruth Lawrence');
});
