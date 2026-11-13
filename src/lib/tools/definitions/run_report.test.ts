import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureDb } from '../fixture-db';
import { booksTotals } from '@/lib/books-totals';
import { booksDay, inBooksPeriod } from '@/lib/books-period';
import { weekBounds } from '@/lib/recap/dates';
import { resolveReportRange, runReportTool } from './run_report';

const OWNER = '11111111-1111-1111-1111-111111111111';

type Rows = Record<string, Record<string, unknown>[]>;

const invoice = (over: Record<string, unknown>) => ({
  user_id: OWNER, kind: 'invoice', status: 'paid', total: 0, amount_paid: 0,
  client_name: 'Maria Santos', created_at: '2026-09-01T12:00:00Z',
  first_sent_at: '2026-09-01T12:00:00Z', sent_at: '2026-09-01T12:00:00Z',
  paid_at: '2026-09-11T12:00:00Z', deleted_at: null, ...over,
});

const payment = (over: Record<string, unknown>) => ({
  user_id: OWNER, invoice_id: 'inv-1', amount: 0, method: 'zelle',
  paid_at: '2026-09-11T12:00:00Z', entry_type: 'payment', ...over,
});

const expense = (over: Record<string, unknown>) => ({
  user_id: OWNER, amount: 0, category: 'other', spent_on: '2026-10-01',
  invoice_id: null, deleted_at: null, ...over,
});

const baseFixture = (timezone = 'UTC'): Rows => ({
  profiles: [{ id: OWNER, timezone }],
  invoices: [
    invoice({ id: 'inv-1', total: 1000, amount_paid: 1000 }),
    invoice({
      id: 'inv-2', total: 400, amount_paid: 400, client_name: 'Maria Santos',
      first_sent_at: '2026-09-05T12:00:00Z', paid_at: '2026-09-19T12:00:00Z',
    }),
    invoice({
      id: 'inv-3', total: 200, amount_paid: 200, client_name: 'Ruth Lawrence',
      first_sent_at: '2026-09-10T12:00:00Z', paid_at: '2026-09-20T12:00:00Z',
    }),
    invoice({
      id: 'inv-4', status: 'sent', total: 500, amount_paid: 100,
      created_at: '2026-11-01T12:00:00Z', first_sent_at: '2026-11-01T12:00:00Z',
      paid_at: null,
    }),
  ],
  invoice_payments: [
    payment({ id: 'p1', invoice_id: 'inv-1', amount: 1000 }),
    payment({ id: 'p2', invoice_id: 'inv-2', amount: 400, paid_at: '2026-09-19T12:00:00Z' }),
    payment({ id: 'p3', invoice_id: 'inv-3', amount: 200, paid_at: '2026-09-20T12:00:00Z' }),
    payment({ id: 'p4', invoice_id: 'inv-1', amount: -50, paid_at: '2026-10-02T12:00:00Z', entry_type: 'refund' }),
  ],
  other_income: [
    {
      id: 'o1', user_id: OWNER, amount: 300, title: 'Side job', client_name: null,
      received_on: '2026-10-04', classification: 'other_income', deposit_id: null, deleted_at: null,
    },
  ],
  expenses: [
    expense({ id: 'e1', amount: 52.1, category: 'fuel', spent_on: '2026-10-14' }),
    expense({ id: 'e2', amount: 20, category: 'food', spent_on: '2026-10-15' }),
  ],
});

const run = (rows: Rows, args: unknown) =>
  runReportTool.handler(
    { db: fixtureDb(rows as never), userId: OWNER },
    runReportTool.input.parse(args),
  ) as Promise<{
    match: string;
    count: number;
    metric: string;
    groupBy: string;
    value: { amount: number; text: string };
    comparison: { previousZero: boolean; text: string; previousAmount: number } | null;
    rows: Array<{ name: string; secondary: string; amount: string; tone: string; chip?: { tone: string; label: string } }>;
    total: { label: string; amount: string };
    totalCount: number;
    clients: Array<{ name: string; total: string; averageDaysToPay: number | null; paidInvoices: number }>;
    slowestExcluded: number;
    slowestNote: string;
    period: { start: string; end: string; timezone: string };
    trend: { points: Array<{ label: string; inc: number; out: number }> };
    breakdown: { state: string; rows: Array<{ name: string }> };
    outstandingAsOf: string;
    ignored: string[];
  }>;

const OCT = { period: 'custom', from: '2026-10-01', to: '2026-10-31' };
const SEP_OCT = { period: 'custom', from: '2026-09-01', to: '2026-10-31' };
const booksRange = (range: { start: string; end: string }) => ({ ...range, granularity: 'range' });

/** The same period rule Books uses, over the fixture rows. */
const booksRows = (rows: Rows, range: { start: string; end: string }, tz = 'UTC') => ({
  payments: (rows.invoice_payments ?? []).filter((row) =>
    inBooksPeriod(booksDay('payment', row.paid_at as string, tz), booksRange(range))),
  otherIncome: (rows.other_income ?? []).filter((row) =>
    inBooksPeriod(booksDay('other_income', row.received_on as string, tz), booksRange(range))),
  expenses: (rows.expenses ?? []).filter((row) =>
    inBooksPeriod(booksDay('expense', row.spent_on as string), booksRange(range))),
  invoices: rows.invoices ?? [],
});

test('collected equals the Books calculation for the same rows', async () => {
  const rows = baseFixture();
  const out = await run(rows, { metric: 'collected', ...SEP_OCT });
  const books = booksTotals({
    payments: rows.invoice_payments as never,
    otherIncome: rows.other_income as never,
    expenses: rows.expenses as never,
    invoices: rows.invoices as never,
  });
  assert.equal(out.value.amount, books.collected);
  assert.equal(out.value.amount, 1850);
});

test('spent, net and outstanding equal the Books calculation too', async () => {
  const rows = baseFixture();
  const books = booksTotals(booksRows(rows, { start: OCT.from, end: OCT.to }) as never);

  const spent = await run(rows, { metric: 'spent', ...OCT });
  assert.equal(spent.value.amount, -books.spent);

  const net = await run(rows, { metric: 'net', ...OCT });
  assert.equal(net.value.amount, books.net);

  const outstanding = await run(rows, { metric: 'outstanding', ...OCT });
  assert.equal(outstanding.value.amount, books.outstanding);
});

test('a month includes its first and last local day, not the minute after midnight', async () => {
  const rows: Rows = {
    profiles: [{ id: OWNER, timezone: 'America/Chicago' }],
    invoices: [1, 2, 3, 4].map((n) => invoice({ id: `inv-${n}`, status: 'paid', total: 10 })),
    invoice_payments: [
      payment({ id: 'p1', invoice_id: 'inv-1', amount: 10, paid_at: '2026-10-01T04:59:00Z' }),
      payment({ id: 'p2', invoice_id: 'inv-2', amount: 20, paid_at: '2026-10-01T05:01:00Z' }),
      payment({ id: 'p3', invoice_id: 'inv-3', amount: 30, paid_at: '2026-11-01T04:59:00Z' }),
      payment({ id: 'p4', invoice_id: 'inv-4', amount: 40, paid_at: '2026-11-01T05:01:00Z' }),
    ],
    other_income: [{
      id: 'o1', user_id: OWNER, amount: 5, title: 'Side job', client_name: null,
      received_on: '2026-10-01', classification: 'other_income', deposit_id: null, deleted_at: null,
    }],
    expenses: [
      expense({ id: 'e1', amount: 1, spent_on: '2026-09-30' }),
      expense({ id: 'e2', amount: 7, spent_on: '2026-10-01' }),
      expense({ id: 'e3', amount: 9, spent_on: '2026-10-31' }),
      expense({ id: 'e4', amount: 11, spent_on: '2026-11-01' }),
    ],
  };

  const out = await run(rows, { metric: 'net', ...OCT });
  // 20 + 30 + 5, with the 23:59 Sep 30 and 00:01 Nov 1 rows outside October.
  assert.equal(out.value.amount, 55 - 16);
  assert.equal(out.period.timezone, 'America/Chicago');

  const books = booksTotals(booksRows(rows, { start: OCT.from, end: OCT.to }, 'America/Chicago') as never);
  assert.equal(out.value.amount, books.net);
});

test('a category word narrows spending: gas means fuel', async () => {
  const out = await run(baseFixture(), { metric: 'spent', category: 'gas', ...OCT });
  assert.equal(out.value.amount, -52.1);
  assert.equal(out.value.text, '\u2212$52.10');
  assert.equal(out.breakdown.rows[0]?.name, 'Fuel');
});

test('a period with no data is none and has no card', async () => {
  const out = await run(baseFixture(), { metric: 'collected', period: 'custom', from: '2020-01-01', to: '2020-01-31' });
  assert.equal(out.match, 'none');
  assert.equal(runReportTool.templateFor?.(out as never), null);
});

test('outstanding is as of now even when the period is in the past', async () => {
  const out = await run(baseFixture(), { metric: 'outstanding', period: 'custom', from: '2020-01-01', to: '2020-01-31' });
  assert.equal(out.value.amount, 400);
  assert.equal(out.outstandingAsOf, 'now');
  assert.equal(out.period.start, '2020-01-01');
  assert.equal(out.count, 1);
});

test('slowest payers are all-time, show what is owed now, and leave out clients with one paid invoice', async () => {
  const out = await run(baseFixture(), { metric: 'collected', sort: 'slowest', ...SEP_OCT });
  assert.equal(out.groupBy, 'client');
  assert.equal(out.rows.length, 1);
  assert.equal(out.rows[0].name, 'Maria Santos');
  assert.equal(out.rows[0].secondary, '2 paid invoices');
  assert.equal(out.rows[0].amount, '$400.00');
  assert.equal(out.rows[0].tone, 'neutral');
  assert.deepEqual(out.rows[0].chip, { tone: 'late', label: '12d avg' });
  assert.deepEqual(out.total, { label: 'Still owed · 1 client', amount: '$400.00', tone: 'neutral' });
  assert.equal(out.slowestExcluded, 1);
  assert.match(out.slowestNote, /all time/);
  assert.match(out.slowestNote, /1 client left out/);
  assert.equal(out.clients[0].total, '$400.00');
  assert.equal(out.clients[0].averageDaysToPay, 12);
  assert.equal(out.clients[0].paidInvoices, 2);
});

test('slowest sets the grouping and ignores the requested period', async () => {
  const out = await run(baseFixture(), {
    metric: 'collected', group_by: 'category', sort: 'slowest',
    period: 'custom', from: '2020-01-01', to: '2020-01-31',
  });
  assert.equal(out.groupBy, 'client');
  assert.equal(out.rows[0]?.name, 'Maria Santos');
  assert.equal(out.rows[0]?.amount, '$400.00');
  assert.equal(out.match, 'one');
  assert.equal(out.slowestExcluded, 1, 'left out is counted across all time, not the period');
  // Plain words, no tool vocabulary: the dates asked about are named as dates.
  assert.match(out.slowestNote, /not just the dates you asked about/);
  assert.doesNotMatch(out.slowestNote, /period|metric/);
});

test('the slowest total is the money still owed by every ranked client', async () => {
  const rows = baseFixture();
  rows.invoices = [
    ...rows.invoices,
    invoice({
      id: 'inv-5', total: 150, amount_paid: 0, client_name: 'Ruth Lawrence', status: 'sent',
      first_sent_at: '2026-10-01T12:00:00Z', paid_at: null, created_at: '2026-09-01T12:00:00Z',
    }),
    invoice({
      id: 'inv-6', total: 300, amount_paid: 300, client_name: 'Ruth Lawrence',
      first_sent_at: '2026-10-01T12:00:00Z', paid_at: '2026-10-04T12:00:00Z',
    }),
  ];
  rows.invoice_payments = [
    ...rows.invoice_payments,
    payment({ id: 'p5', invoice_id: 'inv-6', amount: 300, paid_at: '2026-10-04T12:00:00Z' }),
  ];

  const out = await run(rows, { metric: 'collected', sort: 'slowest', period: 'custom', from: '2020-01-01', to: '2020-01-31' });
  assert.deepEqual(out.rows.map((r) => r.name), ['Maria Santos', 'Ruth Lawrence']);
  assert.deepEqual(out.rows.map((r) => r.amount), ['$400.00', '$150.00']);
  assert.deepEqual(out.rows.map((r) => r.chip?.label), ['12d avg', '7d avg']);
  assert.deepEqual(out.total, { label: 'Still owed · 2 clients', amount: '$550.00', tone: 'neutral' });
  assert.equal(out.slowestExcluded, 0);
});

test('top clients rank by the metric, and the card is a ranked list', async () => {
  const out = await run(baseFixture(), { metric: 'collected', group_by: 'client', ...SEP_OCT });
  assert.equal(out.rows[0].name, 'Maria Santos');
  assert.equal(out.rows[0].amount, '+$1,350.00');
  assert.equal(runReportTool.templateFor?.(out as never), 'list.ranked');
});

test('a compare against a zero previous period says so instead of dividing by zero', async () => {
  const rows = baseFixture();
  rows.invoice_payments = [];
  rows.invoices = [];
  const out = await run(rows, { metric: 'collected', compare: true, ...OCT });
  assert.equal(out.comparison?.previousAmount, 0);
  assert.equal(out.comparison?.previousZero, true);
  assert.equal(out.comparison?.text, 'No prior figure');
});

test('week grouping starts Monday and the chart is chosen at two or more points', async () => {
  assert.deepEqual(
    { start: weekBounds('2026-11-12').start, end: weekBounds('2026-11-12').end },
    { start: '2026-11-09', end: '2026-11-15' },
  );
  assert.equal(resolveReportRange('this_week', '2026-11-12').range.start, '2026-11-09');
  assert.equal(resolveReportRange('last_week', '2026-11-12').range.start, '2026-11-02');

  const out = await run(baseFixture(), { metric: 'collected', group_by: 'week', ...SEP_OCT });
  assert.ok(out.trend.points.length >= 2);
  assert.equal(runReportTool.templateFor?.(out as never), 'chart.trend');
});

test('the profile timezone decides the local day', async () => {
  const rows = baseFixture('Pacific/Kiritimati');
  rows.invoice_payments = [payment({ id: 'p1', amount: 100, paid_at: '2026-10-31T23:00:00Z' })];
  rows.invoices = [invoice({ id: 'inv-1', total: 100, amount_paid: 100 })];
  rows.other_income = [];
  const out = await run(rows, { metric: 'collected', ...OCT });
  // 23:00 UTC on Oct 31 is already Nov 1 in Kiritimati, so October is empty.
  assert.equal(out.value.amount, 0);
  assert.equal(out.match, 'none');
});

test('period "year" and "this year" mean this_year, never a quiet fall back to this month', async () => {
  for (const period of ['year', 'this_year', 'this year']) {
    const out = (await run(baseFixture(), { metric: 'collected', period })) as never as {
      period: { id: string }; ignored: string[];
    };
    assert.equal(out.period.id, 'this_year', period);
    assert.deepEqual(out.ignored, [], period);
  }
});
