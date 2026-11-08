import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { canReviseEstimate, reviseBlockedLine, revisionFieldsFromDraft, saveEstimateRevision } from './revise';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

test('revise: one PATCH to the edits route, same id, content fields only', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(JSON.stringify({ estimate: { id: 'est-1', estimate_version: 2 } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  const fields = revisionFieldsFromDraft({
    title: 'Deck restain',
    line_items: [{ description: 'Deck', qty: 1, unit_price: 100 }],
    notes: 'Gate code 1234',
    tax_rate: 8,
    deposit_type: 'fixed',
    deposit_value: 50,
    due_date: '2026-12-01',
    // The chat can re-parse these too; they must not ride along.
    client_name: 'Brandon',
    client_email: 'brandon@example.com',
    client_phone: '555-0100',
    client_address: '12 Oak St',
  } as Parameters<typeof revisionFieldsFromDraft>[0]);

  const outcome = await saveEstimateRevision('est-1', fields);
  assert.equal(outcome.ok, true);
  assert.equal(calls.length, 1, 'one call for the whole revision');
  assert.equal(calls[0].url, '/api/estimates/est-1/edits');
  assert.equal(calls[0].init.method, 'PATCH');

  const body = JSON.parse(String(calls[0].init.body)) as Record<string, unknown>;
  assert.deepEqual(
    Object.keys(body).sort(),
    ['deposit_type', 'deposit_value', 'due_date', 'line_items', 'notes', 'tax_rate', 'title'],
  );
  for (const key of [
    'client_name', 'client_email', 'client_phone', 'client_address',
    'invoice_number', 'public_token', 'status', 'kind', 'finalize_key', 'user_id',
  ]) {
    assert.equal(key in body, false, `${key} never travels`);
  }
});

test('revise: a locked estimate is refused before the tap, with its own line', () => {
  const base = { kind: 'quote' as const, status: 'sent', amountPaid: 0 };
  assert.equal(canReviseEstimate(base), true, 'sent, unpaid, unsigned, unconverted');
  assert.equal(canReviseEstimate({ ...base, approvedAt: '2026-11-01T00:00:00.000Z' }), false, 'signed');
  assert.equal(canReviseEstimate({ ...base, converted: true }), false, 'converted');
  assert.equal(canReviseEstimate({ ...base, amountPaid: 5 }), false, 'a payment landed');
  assert.equal(canReviseEstimate({ ...base, status: 'draft' }), false, 'not shared yet');
  assert.equal(canReviseEstimate({ ...base, kind: 'invoice' }), false, 'invoice Revise is its own flow');

  assert.equal(reviseBlockedLine('signed'), 'This estimate is signed and locked.');
  assert.equal(reviseBlockedLine('converted'), 'This estimate was converted, so it is locked.');
  assert.equal(reviseBlockedLine(null), null);
});

test('revise: the staged fields are the allowlist, and an empty draft still saves a shape', () => {
  const fields = revisionFieldsFromDraft({});
  assert.deepEqual(Object.keys(fields).sort(), [
    'deposit_type', 'deposit_value', 'due_date', 'line_items', 'notes', 'tax_rate', 'title',
  ]);
  assert.equal(fields.tax_rate, 0);
  assert.equal(fields.deposit_type, 'none');
  assert.equal(fields.deposit_value, null);
});
