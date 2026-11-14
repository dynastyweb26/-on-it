import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureDb } from '../fixture-db';
import { getClientSummaryTool } from './get_client_summary';
import { cardFor } from '../registry';

const OWNER = '11111111-1111-1111-1111-111111111111';
const client = (name: string, over: Record<string, unknown> = {}) => ({
  id: `cli-${name.split(' ')[0].toLowerCase()}`, user_id: OWNER, name, email: null,
  phone: null, address: null, created_at: '2026-01-01T00:00:00Z', ...over,
});
const doc = (n: number, over: Record<string, unknown> = {}) => ({
  id: `inv-${n}`, user_id: OWNER, kind: 'invoice', invoice_number: n, client_name: 'Ruth Lawrence',
  status: 'sent', total: '120.00', amount_paid: 0, due_date: '2026-09-01',
  created_at: '2026-09-01T00:00:00Z', deleted_at: null, line_items: [], ...over,
});
/** One invoice_payments ledger row, as the amount_paid trigger would leave it. */
const payment = (id: string, invoiceId: string, amount: string, over: Record<string, unknown> = {}) => ({
  id, user_id: OWNER, invoice_id: invoiceId, amount, method: 'zelle',
  paid_at: '2026-09-02T00:00:00Z', created_at: '2026-09-02T00:00:00Z', entry_type: 'payment',
  stripe_checkout_session_id: null, ...over,
});
const run = (name: string, clients: unknown[], docs: unknown[] = [], payments: unknown[] = []) =>
  getClientSummaryTool.handler(
    {
      db: fixtureDb({
        clients: clients as never,
        invoices: docs as never,
        invoice_payments: payments as never,
      }),
      userId: OWNER,
    },
    getClientSummaryTool.input.parse({ name }),
  );

type Summary = {
  match: string;
  tiles: { label: string; value: string; tone: string; period: string }[];
  summary: { owed: string; paid: string; open: number; estimates: number };
};

test('one client gets owed, paid and open tiles as money strings', async () => {
  const out = (await run('ruth', [client('Ruth Lawrence')], [
    doc(1),
    doc(2, { status: 'paid', amount_paid: '120.00' }),
    doc(3, { kind: 'quote' }),
    doc(4, { status: 'void' }),
  ], [
    payment('pay-2', 'inv-2', '120.00'),
  ])) as never as Summary;
  assert.equal(out.match, 'one');
  assert.equal(out.summary.owed, '$120.00');
  assert.equal(out.summary.paid, '$120.00');
  assert.equal(out.summary.open, 1);
  assert.equal(out.summary.estimates, 1);
  assert.equal(out.tiles[0].value, '$120.00');
  // Money a client owes the owner is not money out.
  assert.equal(out.tiles[0].tone, 'neutral');
});

test('Paid is the money received: part payments on open invoices count', async () => {
  // One $40 invoice paid in full, one $40 invoice with $20 received so far.
  const out = (await run('ruth', [client('Ruth Lawrence')], [
    doc(1, { status: 'paid', total: '40.00', amount_paid: '40.00' }),
    doc(2, { total: '40.00', amount_paid: '20.00' }),
  ], [
    payment('pay-1', 'inv-1', '40.00'),
    payment('pay-2', 'inv-2', '20.00'),
  ])) as never as Summary;
  assert.equal(out.summary.paid, '$60.00');
  assert.equal(out.summary.owed, '$20.00');
  assert.equal(out.tiles[1].value, '$60.00');
  assert.equal(out.tiles[0].value, '$20.00');
});

test('Paid is the ledger, not the invoice: a status with no payment invents nothing', async () => {
  const out = (await run('ruth', [client('Ruth Lawrence')], [
    doc(1, { status: 'paid', amount_paid: '120.00' }),
  ])) as never as Summary;
  assert.equal(out.summary.paid, '$0.00');
});

test('a refund row nets out of Paid, as Books counts it', async () => {
  const out = (await run('ruth', [client('Ruth Lawrence')], [
    doc(1, { status: 'paid', total: '40.00', amount_paid: '40.00' }),
  ], [
    payment('pay-1', 'inv-1', '40.00'),
    payment('pay-2', 'inv-1', '-10.00', { entry_type: 'refund' }),
  ])) as never as Summary;
  assert.equal(out.summary.paid, '$30.00');
});

test('three tiles fit a 390-wide phone: no label or sub truncates', async () => {
  // Three tiles share the card, so each gets about a third of 390 minus gaps
  // and padding. These budgets are what prints in full at that width.
  const out = (await run('ruth', [client('Ruth Lawrence')], [doc(1)])) as never as Summary;
  assert.equal(out.tiles.length, 3);
  for (const tile of out.tiles) {
    assert.ok(tile.label.length <= 4, `label "${tile.label}" is too wide for three tiles`);
    assert.ok(tile.period.length <= 8, `sub "${tile.period}" is too wide for three tiles`);
  }
  assert.deepEqual(out.tiles.map((t) => t.label), ['Owed', 'Paid', 'Open']);
});

test('two Ruths are never guessed between', async () => {
  const out = (await run('ruth', [client('Ruth Lawrence'), client('Ruth Chen')])) as never as {
    match: string; tiles: unknown[]; summary: unknown; clients: unknown[];
  };
  assert.equal(out.match, 'many');
  assert.equal(out.tiles.length, 0);
  assert.equal(out.summary, null);
  assert.equal(out.clients.length, 2);
});

test('two matches carry each client’s own owed balance, never a literal', async () => {
  const out = (await run('ruth', [client('Ruth Lawrence'), client('Ruth Chen')], [
    doc(1, { total: '120.00', amount_paid: 0 }),
    doc(2, { client_name: 'Ruth Chen', total: '80.00', amount_paid: '30.00' }),
  ])) as never as { rows: { name: string; amount: string }[] };
  const byName = new Map(out.rows.map((r) => [r.name, r.amount]));
  assert.equal(byName.get('Ruth Lawrence'), '$120.00');
  assert.equal(byName.get('Ruth Chen'), '$50.00');
  // The computed figures, not one repeated stub, and no figure that the
  // client's own documents do not support.
  for (const row of out.rows) {
    const expected = row.name === 'Ruth Lawrence' ? '$120.00' : '$50.00';
    assert.equal(row.amount, expected, `${row.name} shows an amount its documents do not support`);
  }
});

test('no match invents nothing', async () => {
  const out = (await run('zebediah', [])) as never as { match: string; summary: unknown; tiles: unknown[] };
  assert.equal(out.match, 'none');
  assert.equal(out.summary, null);
  assert.deepEqual(out.tiles, []);
});

test('zero matches render no card, and two matches render the ranked list', async () => {
  const none = (await run('zebediah', [])) as never as { match: string };
  assert.equal(none.match, 'none');
  assert.equal(cardFor(getClientSummaryTool, none), null);
  const many = (await run('ruth', [client('Ruth Lawrence'), client('Ruth Chen')])) as never as { count: number };
  assert.equal(cardFor(getClientSummaryTool, many)?.id, 'list.ranked');
});

test("another owner's documents and payments do not count towards the summary", async () => {
  const out = (await run('ruth', [client('Ruth Lawrence')], [
    doc(1, { user_id: '22222222-2222-2222-2222-222222222222', total: '999.00' }),
  ], [
    payment('pay-1', 'inv-1', '999.00', { user_id: '22222222-2222-2222-2222-222222222222' }),
  ])) as never as Summary;
  assert.equal(out.summary.owed, '$0.00');
  assert.equal(out.summary.paid, '$0.00');
});
