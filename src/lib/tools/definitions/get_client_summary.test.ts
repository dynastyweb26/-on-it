import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureDb } from '../fixture-db';
import { getClientSummaryTool } from './get_client_summary';

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
const run = (name: string, clients: unknown[], docs: unknown[] = []) =>
  getClientSummaryTool.handler(
    { db: fixtureDb({ clients: clients as never, invoices: docs as never }), userId: OWNER },
    getClientSummaryTool.input.parse({ name }),
  );

test('one client gets owed, paid and open tiles as money strings', async () => {
  const out = (await run('ruth', [client('Ruth Lawrence')], [
    doc(1),
    doc(2, { status: 'paid', amount_paid: '120.00' }),
    doc(3, { kind: 'quote' }),
    doc(4, { status: 'void' }),
  ])) as never as { match: string; tiles: { value: string }[]; summary: { owed: string; paid: string; open: number; estimates: number } };
  assert.equal(out.match, 'one');
  assert.equal(out.summary.owed, '$120.00');
  assert.equal(out.summary.paid, '$120.00');
  assert.equal(out.summary.open, 1);
  assert.equal(out.summary.estimates, 1);
  assert.equal(out.tiles[0].value, '$120.00');
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

test("another owner's documents do not count towards the summary", async () => {
  const out = (await run('ruth', [client('Ruth Lawrence')], [
    doc(1, { user_id: '22222222-2222-2222-2222-222222222222', total: '999.00' }),
  ])) as never as { summary: { owed: string } };
  assert.equal(out.summary.owed, '$0.00');
});
