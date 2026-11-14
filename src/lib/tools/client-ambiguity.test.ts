// ═══ One client name, two people: no tool may answer with money ═══
//
// The same rule, run against every tool that takes a client name. A name that
// matches several clients is a question to ask, so the output, the model
// payload, the fallback sentence and the card all carry no figure at all.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureDb } from './fixture-db';
import { cardFor } from './registry';
import type { ToolDefinition } from './contract';
import { listInvoicesTool } from './definitions/list_invoices';
import { listEstimatesTool } from './definitions/list_estimates';
import { listPaymentsTool } from './definitions/list_payments';
import { getClientSummaryTool } from './definitions/get_client_summary';

const OWNER = '11111111-1111-1111-1111-111111111111';

const TWO_RUTHS = {
  profiles: [{ id: OWNER, timezone: 'America/Chicago' }],
  clients: [
    { id: 'cli-chen', user_id: OWNER, name: 'Ruth Chen', email: 'chen@example.com', phone: null, address: null, created_at: '2026-01-01T00:00:00Z', deleted_at: null },
    { id: 'cli-law', user_id: OWNER, name: 'Ruth Lawrence', email: 'ruth@example.com', phone: null, address: null, created_at: '2026-01-01T00:00:00Z', deleted_at: null },
  ],
  invoices: [
    { id: 'inv-chen', user_id: OWNER, kind: 'invoice', invoice_number: 81, client_name: 'Ruth Chen', status: 'sent', total: 300, amount_paid: 0, due_date: '2026-10-08', created_at: '2026-09-02T12:00:00Z', deleted_at: null },
    { id: 'inv-law', user_id: OWNER, kind: 'invoice', invoice_number: 82, client_name: 'Ruth Lawrence', status: 'overdue', total: 120, amount_paid: 0, due_date: '2026-10-09', created_at: '2026-09-03T12:00:00Z', deleted_at: null },
    { id: 'est-chen', user_id: OWNER, kind: 'quote', invoice_number: 83, client_name: 'Ruth Chen', status: 'sent', total: 450, amount_paid: 0, due_date: '2026-11-20', created_at: '2026-09-04T12:00:00Z', deleted_at: null },
    { id: 'est-law', user_id: OWNER, kind: 'quote', invoice_number: 84, client_name: 'Ruth Lawrence', status: 'sent', total: 900, amount_paid: 0, due_date: '2026-11-21', created_at: '2026-09-05T12:00:00Z', deleted_at: null },
  ],
  invoice_payments: [
    { id: 'pay-chen', user_id: OWNER, invoice_id: 'inv-chen', amount: 40, method: 'cash', paid_at: '2026-10-01T12:00:00Z', created_at: '2026-10-01T12:00:00Z', entry_type: 'payment', stripe_checkout_session_id: null },
    { id: 'pay-law', user_id: OWNER, invoice_id: 'inv-law', amount: 25, method: 'zelle', paid_at: '2026-10-02T12:00:00Z', created_at: '2026-10-02T12:00:00Z', entry_type: 'payment', stripe_checkout_session_id: null },
  ],
  other_income: [],
};

const TOOLS: Array<{ tool: ToolDefinition; args: Record<string, unknown> }> = [
  { tool: listInvoicesTool, args: { client: 'ruth' } },
  { tool: listEstimatesTool, args: { client: 'ruth' } },
  { tool: listPaymentsTool, args: { client: 'ruth' } },
  { tool: getClientSummaryTool, args: { name: 'ruth' } },
];

/** A dollar sign, or any amount shaped like money (with cents). */
const MONEY = /\$|\d[\d,]*\.\d{2}/;
const NAMES = ['Ruth Chen', 'Ruth Lawrence'];

// One shared helper: every string a user or the model can see, from one result.
function visibleText(tool: ToolDefinition, output: unknown): string {
  const parts = [JSON.stringify(output)];
  if (tool.modelPayload) parts.push(JSON.stringify(tool.modelPayload(output as never)));
  parts.push(tool.fallback(output as never));
  const card = cardFor(tool, output);
  parts.push(JSON.stringify(card));
  return parts.join('\n');
}

for (const { tool, args } of TOOLS) {
  test(`${tool.name}: two matching clients carry no money anywhere`, async () => {
    const db = fixtureDb(TWO_RUTHS as never);
    const output = await tool.handler({ db, userId: OWNER }, tool.input.parse(args));

    assert.equal((output as { match: string }).match, 'ambiguous');
    assert.deepEqual((output as { clientChoices: string[] }).clientChoices, NAMES);
    assert.deepEqual((output as { rows: unknown[] }).rows, []);
    assert.equal((output as { total: unknown }).total, null);
    assert.equal((output as { count: number }).count, 0);

    assert.equal(MONEY.test(visibleText(tool, output)), false, 'a figure leaked from an ambiguous name');
    assert.equal(cardFor(tool, output), null, 'an ambiguous name must not draw a card');

    const fallback = tool.fallback(output as never);
    for (const name of NAMES) assert.ok(fallback.includes(name), `the sentence must name ${name}`);
    assert.match(fallback, /Ask again with the full name/);
  });

  test(`${tool.name}: a client nobody has answers no client, with no figures`, async () => {
    const db = fixtureDb(TWO_RUTHS as never);
    const output = await tool.handler({ db, userId: OWNER }, tool.input.parse(
      'client' in args ? { client: 'Zebediah' } : { name: 'Zebediah' },
    ));

    assert.equal((output as { match: string }).match, 'none');
    assert.equal(MONEY.test(visibleText(tool, output)), false, 'a figure leaked from a missing client');
    assert.equal(cardFor(tool, output), null);
    assert.match(tool.fallback(output as never), /^No client named Zebediah on file\.$/);
  });
}

test('the exact full name is answered, and only that client\'s rows', async () => {
  const db = fixtureDb(TWO_RUTHS as never);
  const invoices = await listInvoicesTool.handler({ db, userId: OWNER }, { client: 'Ruth Chen' });
  assert.equal((invoices as { match: string }).match, 'one');
  assert.equal((invoices as { count: number }).count, 1);
  assert.equal((invoices as { documents: { clientName: string }[] }).documents[0].clientName, 'Ruth Chen');

  const summary = await getClientSummaryTool.handler({ db, userId: OWNER }, { name: 'Ruth Chen' });
  assert.equal((summary as { match: string }).match, 'one');
  assert.equal((summary as { summary: { clientName: string } }).summary.clientName, 'Ruth Chen');
});

test('a client who only appears on an invoice still resolves and answers', async () => {
  const db = fixtureDb({
    invoices: [{
      id: 'inv-1', user_id: OWNER, kind: 'invoice', invoice_number: 5, client_name: 'Dwayne Carter',
      status: 'sent', total: 200, amount_paid: 0, due_date: '2026-10-01',
      created_at: '2026-09-01T12:00:00Z', deleted_at: null,
    }],
  } as never);
  const out = await listInvoicesTool.handler({ db, userId: OWNER }, { client: 'dwayne' });
  assert.equal((out as { match: string }).match, 'one');
  assert.equal((out as { count: number }).count, 1);
});
