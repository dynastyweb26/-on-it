// Tiers phase 2, item 5: a conversion stores WHAT the plan refused to copy on
// the NEW invoice (attachments_skipped + attachments_skipped_from), so the note
// from design/tiers 05 survives a reload. Behind NEXT_PUBLIC_TIERS: flag off
// writes no such column at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertEstimateToInvoice } from './convert-client';

type Update = { patch: Record<string, unknown>; id: string };

/** Enough of the Supabase client for one conversion: the estimate read, the
 *  insert, the attachment copy (with the row trigger's plan refusal) and the
 *  note update. */
function fakeClient(opts: { planRefusal: boolean; updateFails?: boolean }) {
  const updates: Update[] = [];
  const inserts: Record<string, unknown>[] = [];
  const attachments = [
    { id: 'a1', storage_path: 'u/est-1/1.jpg', position: 0 },
    { id: 'a2', storage_path: 'u/est-1/2.jpg', position: 1 },
  ];
  const est = {
    id: 'est-1',
    user_id: 'u',
    kind: 'quote',
    invoice_number: 51,
    client_id: 'c',
    client_name: 'Ruth Lawrence',
    client_address: null,
    client_phone: null,
    client_email: null,
    line_items: [],
    subtotal: 100,
    tax_rate: 0,
    tax_amount: 0,
    total: 100,
    notes: null,
    deposit_type: null,
    deposit_value: null,
    deposit_amount: null,
    approved_at: '2026-11-01T00:00:00Z',
    deleted_at: null,
  };
  let seq = 0;

  function invoiceTable() {
    const state: { op: 'select' | 'insert' | 'update'; cols: string; patch?: any; row?: any; filters: Record<string, unknown> } = {
      op: 'select',
      cols: '',
      filters: {},
    };
    const q: any = {
      select: (cols: string) => { state.cols = cols; return q; },
      insert: (row: any) => { state.op = 'insert'; state.row = row; inserts.push(row); return q; },
      update: (patch: any) => { state.op = 'update'; state.patch = patch; return q; },
      eq: (k: string, v: unknown) => { state.filters[k] = v; return q; },
      maybeSingle: async () => {
        // The source-number read (two columns) and the estimate read (the full
        // COLUMNS list) are told apart by what was selected.
        if (state.cols === 'kind, invoice_number') {
          return { data: { kind: 'quote', invoice_number: 51 } };
        }
        return { data: est };
      },
      single: async () => ({ data: { id: 'inv-1', invoice_number: 7 }, error: null }),
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
        if (state.op === 'update') {
          updates.push({ patch: state.patch ?? {}, id: String(state.filters.id) });
          return Promise.resolve({
            data: null,
            error: opts.updateFails ? { code: '42501', message: 'denied' } : null,
          }).then(res, rej);
        }
        return Promise.resolve({ data: null, error: null }).then(res, rej);
      },
    };
    return q;
  }

  function attachmentTable() {
    const q: any = {
      select: () => q,
      eq: () => q,
      order: async () => ({ data: attachments }),
      insert: (row: any) => { q._row = row; return q; },
      // The row trigger refuses a NEW attachment for a non-Plus user.
      single: async () => (opts.planRefusal
        ? { data: null, error: { hint: 'PLAN_ATTACHMENTS', message: 'Attachments need the Plus plan' } }
        : { data: { id: `n${++seq}`, storage_path: q._row.storage_path, position: q._row.position }, error: null }),
      delete: () => q,
      then: (res: (v: unknown) => unknown) => Promise.resolve({ data: null }).then(res),
    };
    return q;
  }

  const db: any = {
    auth: { getUser: async () => ({ data: { user: { id: 'u' } } }) },
    from: (table: string) => (table === 'invoices' ? invoiceTable() : attachmentTable()),
    storage: {
      from: () => ({
        download: async () => ({ data: new Blob(['img']) }),
        upload: async () => ({ error: null }),
        createSignedUrl: async (path: string) => ({ data: { signedUrl: `signed:${path}` } }),
        remove: async () => ({ error: null }),
      }),
    },
  };
  return { db, updates, inserts };
}

test('convert stores the skipped count and the source number on the new invoice', async () => {
  const { db, updates } = fakeClient({ planRefusal: true });
  const out = await convertEstimateToInvoice(db, 'est-1', true);
  assert.equal(out.ok, true, 'a refused copy is not a failed conversion');
  if (!out.ok) return;
  assert.deepEqual(out.attachmentsSkipped, { count: 2, sourceDocNumber: 'E-0051' });
  assert.deepEqual(updates, [{
    id: 'inv-1',
    patch: { attachments_skipped: 2, attachments_skipped_from: 51 },
  }]);
});

test('convert with the flag off writes neither column', async () => {
  const { db, updates } = fakeClient({ planRefusal: true });
  const out = await convertEstimateToInvoice(db, 'est-1', false);
  assert.equal(out.ok, true);
  assert.deepEqual(updates, [], 'today’s conversion writes nothing new');
  // The caller still learns what was skipped (the note reads the outcome).
  assert.equal(out.ok && out.attachmentsSkipped.count, 2);
});

test('convert with photos copied writes no note row', async () => {
  const { db, updates } = fakeClient({ planRefusal: false });
  const out = await convertEstimateToInvoice(db, 'est-1', true);
  assert.equal(out.ok, true);
  assert.equal(out.ok && out.attachmentsSkipped.count, 0);
  assert.deepEqual(updates, [], 'nothing skipped, nothing to remember');
});

test('convert inserts the invoice before the copy, never with the note columns', async () => {
  const { db, inserts } = fakeClient({ planRefusal: true });
  await convertEstimateToInvoice(db, 'est-1', true);
  assert.equal(inserts.length, 1);
  assert.equal('attachments_skipped' in inserts[0], false);
  assert.equal('attachments_skipped_from' in inserts[0], false);
});

test('a failed note update never fails the conversion', async () => {
  const { db, updates } = fakeClient({ planRefusal: true, updateFails: true });
  const original = console.error;
  const logged: unknown[] = [];
  console.error = (...args: unknown[]) => { logged.push(args); };
  try {
    const out = await convertEstimateToInvoice(db, 'est-1', true);
    assert.equal(out.ok, true, 'the invoice exists and is shown');
    assert.equal(out.ok && out.attachmentsSkipped.count, 2);
    assert.equal(updates.length, 1, 'the write was attempted');
    assert.equal(logged.length, 1, 'and its failure is logged, not thrown');
  } finally {
    console.error = original;
  }
});
