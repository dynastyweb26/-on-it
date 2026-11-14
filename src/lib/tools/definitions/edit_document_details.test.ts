import test from 'node:test';
import assert from 'node:assert/strict';
import { editDocumentDetailsTool } from './edit_document_details';
import { fixtureDb } from '../fixture-db';
import { fixtureWriteDb } from '../write-fixture';

const OWNER = '11111111-1111-1111-1111-111111111111';

const doc = (over: Record<string, unknown> = {}) => ({
  id: 'inv-12',
  user_id: OWNER,
  kind: 'invoice',
  invoice_number: 12,
  client_name: 'Maria Santos',
  status: 'draft',
  due_date: '2026-12-05',
  notes: 'Thanks',
  approved_at: null,
  converted_from: null,
  revoked_at: null,
  deleted_at: null,
  ...over,
});

const prepare = (args: Record<string, unknown>, rows: unknown[] = [doc()], extra: Record<string, unknown> = {}) =>
  editDocumentDetailsTool.prepare!(
    { db: fixtureDb({ invoices: rows as never, clients: [], other_income: [], ...extra } as never), userId: OWNER },
    args as never,
  );

test('the card reads like the design: Due date on INV-0012: Dec 5 to Dec 12', async () => {
  const prepared = await prepare({ number: 12, due_date: '2026-12-12' });
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.equal(prepared.row.summary, 'Due date on INV-0012: Dec 5 to Dec 12');
  assert.deepEqual(prepared.resolved, {
    id: 'inv-12', label: 'INV-0012', kind: 'invoice',
    oldDue: '2026-12-05', oldNotes: 'Thanks', due: '2026-12-12', notes: 'Thanks',
  });
});

test('a sent invoice is refused', async () => {
  const prepared = await prepare({ number: 12, notes: 'New' }, [doc({ status: 'sent' })]);
  assert.equal(prepared.ok, false);
  if (prepared.ok) return;
  assert.match(prepared.problem, /INV-0012 is sent, so its details cannot change/);
});

test('an estimate stays editable until it is signed', async () => {
  const editable = await prepare({ number: 4, notes: 'New' }, [doc({ id: 'est-4', kind: 'quote', invoice_number: 4, status: 'sent' })]);
  assert.equal(editable.ok, true);

  const signed = await prepare({ number: 4, notes: 'New' }, [
    doc({ id: 'est-4', kind: 'quote', invoice_number: 4, status: 'sent', approved_at: '2026-11-01T00:00:00Z' }),
  ]);
  assert.equal(signed.ok, false);
  if (signed.ok) return;
  assert.match(signed.problem, /was signed/);
});

test('two documents for one client is a question naming both', async () => {
  const prepared = await prepare({ client: 'Maria', notes: 'New' }, [
    doc(),
    doc({ id: 'inv-13', invoice_number: 13 }),
  ], {
    clients: [{ id: 'cli-1', user_id: OWNER, name: 'Maria Santos', deleted_at: null }],
  });
  assert.equal(prepared.ok, false);
  if (prepared.ok) return;
  assert.match(prepared.problem, /I found 2 documents for Maria Santos/);
});

test('execute writes the due date and notes on the one row', async () => {
  const db = fixtureWriteDb({ invoices: [doc()] }, OWNER);
  const out = await editDocumentDetailsTool.execute!(
    { db, userId: OWNER },
    {
      id: 'inv-12', label: 'INV-0012', kind: 'invoice',
      oldDue: '2026-12-05', oldNotes: 'Thanks', due: '2026-12-12', notes: 'Thanks again',
    },
    'action-1',
  );
  assert.equal(out.ok, true);
  assert.equal(db.updates, 1);
  const row = db.rows.invoices[0] as Record<string, unknown>;
  assert.equal(row.due_date, '2026-12-12');
  assert.equal(row.notes, 'Thanks again');
});

test('execute refuses when the row moved since the card', async () => {
  const db = fixtureWriteDb({ invoices: [doc({ notes: 'Changed by hand' })] }, OWNER);
  const out = await editDocumentDetailsTool.execute!(
    { db, userId: OWNER },
    {
      id: 'inv-12', label: 'INV-0012', kind: 'invoice',
      oldDue: '2026-12-05', oldNotes: 'Thanks', due: '2026-12-12', notes: 'Thanks again',
    },
    'action-1',
  );
  assert.equal(out.ok, false);
  assert.equal(db.updates, 0);
});
