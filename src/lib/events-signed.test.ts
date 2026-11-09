// Item 24: the estimate_signed producer. The signature is the RPC's business;
// these tests pin the card's one-only, never-fatal behaviour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordEstimateSigned } from '@/lib/events-signed';
import { estimateSignedEvent } from '@/lib/events';

const signed = {
  ok: true as const,
  estimate_id: 'q1',
  user_id: 'owner1',
  invoice_number: 49,
  client_name: 'Ruth',
  total: '250.00',
};

/** The dedupe index, in miniature: a repeated key inserts nothing. */
function ledger() {
  const rows = new Map<string, { kind: string; actor: string; amount: number | null; documentNumber: number | null }>();
  let calls = 0;
  return {
    rows,
    calls: () => calls,
    insert: async (row: { dedupeKey?: string | null; kind: string; actor: string; amount?: number | null; documentNumber?: number | null }) => {
      calls += 1;
      const key = row.dedupeKey ?? '';
      if (rows.has(key)) return null;
      rows.set(key, { kind: row.kind, actor: row.actor, amount: row.amount ?? null, documentNumber: row.documentNumber ?? null });
      return 'evt-1';
    },
  };
}

test('a signature posts one client card: signed estimate, the total, one key', async () => {
  const db = ledger();
  assert.equal(await recordEstimateSigned(signed, null, db.insert), 'evt-1');
  const [key] = [...db.rows.keys()];
  assert.equal(key, 'estimate_signed:q1');
  assert.deepEqual(db.rows.get('estimate_signed:q1'), {
    kind: 'estimate_signed', actor: 'client', amount: 250, documentNumber: 49,
  });
  const e = estimateSignedEvent(signed);
  assert.equal(e.invoiceId, 'q1');
  assert.equal(e.documentKind, 'quote');
  assert.equal(e.clientName, 'Ruth');
});

test('a retried signature writes nothing: the key is already taken', async () => {
  const db = ledger();
  await recordEstimateSigned(signed, null, db.insert);
  assert.equal(await recordEstimateSigned(signed, null, db.insert), null);
  assert.equal(db.rows.size, 1);
});

test('already_approved is not a new card', async () => {
  const db = ledger();
  const id = await recordEstimateSigned({ ok: false, code: 'already_approved' }, null, db.insert);
  assert.equal(id, null);
  assert.equal(db.calls(), 0);
  assert.equal(db.rows.size, 0);
});

test('the owner signing their own link posts nothing', async () => {
  const db = ledger();
  assert.equal(await recordEstimateSigned(signed, 'owner1', db.insert), null);
  assert.equal(db.calls(), 0);
});

test('a failed card never fails the signature', async () => {
  const logged: string[] = [];
  const id = await recordEstimateSigned(signed, null, async () => { throw new Error('events down'); }, (m) => logged.push(m));
  assert.equal(id, null);
  assert.equal(logged.length, 1);
});
