// The definition is only as good as its handler: this runs the real unpaid tool
// over a fixture database with two owners' rows and asserts the caller sees
// exactly their own. No network, no live project, no service role.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureDb } from '../fixture-db';
import {
  UNPAID_TOOL_NAME,
  UnpaidOutput,
  daysBetween,
  shortDate,
  unpaidCard,
  unpaidTool,
} from './unpaid';
import { summarizeUnpaid } from '../unpaid';

const OWNER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';

const invoice = (overrides: Record<string, unknown>) => ({
  id: 'inv-1',
  user_id: OWNER,
  kind: 'invoice',
  invoice_number: 42,
  client_name: 'Maria Santos',
  total: 120,
  amount_paid: 0,
  due_date: '2026-10-01',
  status: 'sent',
  deleted_at: null,
  ...overrides,
});

test('the tool is described the way the registry promises', () => {
  assert.equal(unpaidTool.name, UNPAID_TOOL_NAME);
  assert.equal(unpaidTool.type, 'read');
  assert.equal(unpaidTool.risk, 'low');
  assert.equal(unpaidTool.defaultTemplate.id, 'list.ranked');
});

test('the handler answers from the caller rows only', async () => {
  const db = fixtureDb({
    invoices: [
      invoice({ id: 'mine', client_name: 'Maria Santos', total: 120 }),
      invoice({ id: 'theirs', user_id: OTHER, client_name: 'Them', total: 999 }),
      invoice({ id: 'paid', amount_paid: 120 }),
      invoice({ id: 'draft', status: 'draft' }),
      invoice({ id: 'estimate', kind: 'quote' }),
      invoice({ id: 'gone', deleted_at: '2026-11-01T00:00:00Z' }),
    ],
  });

  const result = UnpaidOutput.parse(await unpaidTool.handler({ db, userId: OWNER }, {}));
  assert.equal(result.totalCount, 1);
  assert.deepEqual(result.rows.map((row) => row.id), ['mine']);
  assert.equal(result.totalBalance, 120);
  assert.equal(result.totalBalanceText, '$120.00');
  assert.equal(result.sentence, '1 invoice is still open, $120.00 outstanding.');
  assert.equal(result.eyebrow, 'Who owes you');
  assert.equal(result.rows[0].amount, '$120.00', 'a finished server string, not a number');
  assert.equal(result.total.label, 'Owed to you · 1 client');
  assert.equal(result.total.amount, '$120.00');
  // The fallback is what the user reads until the component exists.
  assert.equal(unpaidTool.fallback(result as never), result.sentence);
  // A read tool never writes, and the fixture proves it.
  assert.equal(db.attempts, 0);
});

test('the handler honours the model filters without widening the read', async () => {
  const db = fixtureDb({
    invoices: [
      invoice({ id: 'small', total: 40 }),
      invoice({ id: 'big', total: 500 }),
    ],
  });

  const filtered = UnpaidOutput.parse(
    await unpaidTool.handler({ db, userId: OWNER }, { min_balance: 100 }),
  );
  assert.deepEqual(filtered.rows.map((row) => row.id), ['big']);

  const capped = UnpaidOutput.parse(await unpaidTool.handler({ db, userId: OWNER }, { limit: 1 }));
  assert.equal(capped.rows.length, 1);
  assert.equal(capped.totalCount, 2, 'the count always describes every unpaid invoice');
});

test('the card ranks rows with a late chip and a server-composed total', () => {
  const summary = summarizeUnpaid([
    {
      id: 'inv-1',
      invoice_number: 42,
      client_name: 'Maria Santos',
      total: '120.00',
      amount_paid: '0',
      due_date: '2026-10-01',
      status: 'sent',
    },
    {
      id: 'inv-2',
      invoice_number: 43,
      client_name: 'Ruth Lawrence',
      total: '80.00',
      amount_paid: '0',
      due_date: null,
      status: 'overdue',
    },
  ]);
  const card = unpaidCard(summary, '2026-11-12');

  assert.deepEqual(card.rows.map((row) => row.id), ['inv-1', 'inv-2']);
  assert.equal(card.rows[0].secondary, 'INV-0042 · Due Oct 1');
  assert.deepEqual(card.rows[0].chip, { tone: 'late', label: '42d late' });
  assert.equal(card.rows[1].secondary, 'INV-0043');
  assert.equal(card.rows[1].chip, undefined);
  assert.equal(card.total.label, 'Owed to you · 2 clients');
  assert.equal(card.total.amount, '$200.00');
  assert.equal(card.total.tone, 'neutral');
});

test('the card is empty, not invented, when nothing is outstanding', () => {
  const card = unpaidCard(summarizeUnpaid([]), '2026-11-12');
  assert.deepEqual(card.rows, []);
  assert.equal(card.totalCount, 0);
  assert.equal(card.total.amount, '$0.00');
  assert.equal(card.total.label, 'Owed to you · 0 clients');
});

test('dates read as the design does, in UTC, and never move a day', () => {
  assert.equal(shortDate('2026-10-01'), 'Oct 1');
  assert.equal(shortDate('2026-01-31'), 'Jan 31');
  assert.equal(shortDate('not-a-date'), 'not-a-date');
  assert.equal(daysBetween('2026-10-01', '2026-11-12'), 42);
  assert.equal(daysBetween('2026-11-12', '2026-11-12'), 0);
  assert.equal(daysBetween('', '2026-11-12'), 0);
});

test('a database error becomes a failed result, never a fake answer', async () => {
  const broken = {
    select: async () => ({ data: null, error: { message: 'permission denied' } }),
  };
  await assert.rejects(
    unpaidTool.handler({ db: broken as never, userId: OWNER }, {}),
    /permission denied/,
  );
});
