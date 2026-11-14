import test from 'node:test';
import assert from 'node:assert/strict';
import { editClientTool, RENAME_ELSEWHERE } from './edit_client';
import { fixtureDb } from '../fixture-db';
import { fixtureWriteDb } from '../write-fixture';

const OWNER = '11111111-1111-1111-1111-111111111111';

const client = (over: Record<string, unknown> = {}) => ({
  id: 'cli-1',
  user_id: OWNER,
  name: 'Maria Santos',
  phone: null,
  email: 'maria@example.com',
  address: null,
  deleted_at: null,
  ...over,
});

const prepare = (args: Record<string, unknown>, clients = [client()]) =>
  editClientTool.prepare!({ db: fixtureDb({ clients }), userId: OWNER }, args as never);

test('the card says exactly what changes, old value to new', async () => {
  const prepared = await prepare({ client: 'Maria', phone: '555-0199' });
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.equal(prepared.row.summary, 'Change client Maria Santos: phone none to 555-0199');
  assert.equal(prepared.row.amount, '');
  assert.deepEqual(prepared.resolved, {
    id: 'cli-1',
    oldName: 'Maria Santos',
    oldPhone: null,
    oldEmail: 'maria@example.com',
    name: 'Maria Santos',
    phone: '555-0199',
    email: 'maria@example.com',
  });
});

test('an email change is proposed the same way', async () => {
  const prepared = await prepare({ client: 'Maria', email: 'm.santos@example.com' });
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.equal(prepared.row.summary, 'Change client Maria Santos: email maria@example.com to m.santos@example.com');
});

test('a rename is refused, and the sentence says where a rename lives', async () => {
  // Invoices keep their own client_name text, so renaming the row here would
  // leave every past invoice under the old name. The Clients screen owns it.
  const prepared = await prepare({ client: 'Maria', name: 'Maria Silva' });
  assert.equal(prepared.ok, false);
  if (prepared.ok) return;
  assert.equal(
    prepared.problem,
    "I can change a client's phone or email here. To rename a client, open them in Clients.",
  );
  assert.equal(prepared.problem, RENAME_ELSEWHERE);
});

test('a rename is refused even alongside a phone change', async () => {
  const prepared = await prepare({ client: 'Maria', name: 'Maria Silva', phone: '555-0199' });
  assert.equal(prepared.ok, false);
  if (prepared.ok) return;
  assert.equal(prepared.problem, RENAME_ELSEWHERE);
});

test('several clients with that name is a question, never a guess', async () => {
  const prepared = await prepare({ client: 'Maria', phone: '555-0199' }, [
    client(),
    client({ id: 'cli-2', name: 'Maria Silva' }),
  ]);
  assert.equal(prepared.ok, false);
  if (prepared.ok) return;
  assert.match(prepared.problem, /Maria Santos/);
  assert.match(prepared.problem, /Maria Silva/);
  assert.match(prepared.problem, /Which one\?/);
});

test('a client that only exists on an invoice has no row to change', async () => {
  const prepared = await prepare({ client: 'Maria', phone: '555-0199' }, []);
  assert.equal(prepared.ok, false);
});

test('execute updates the one row, scoped by its id, and never the name', async () => {
  const db = fixtureWriteDb({ clients: [client()] }, OWNER);
  const out = await editClientTool.execute!(
    { db, userId: OWNER },
    { id: 'cli-1', oldName: 'Maria Santos', oldPhone: null, oldEmail: 'maria@example.com', name: 'Maria Santos', phone: '555-0199', email: 'maria@example.com' },
    'action-1',
  );
  assert.equal(out.ok, true);
  assert.equal(db.updates, 1);
  const row = db.rows.clients[0] as Record<string, unknown>;
  assert.equal(row.phone, '555-0199');
  assert.equal(row.name, 'Maria Santos');
});

test('execute refuses when the row moved since the card was drawn', async () => {
  const db = fixtureWriteDb({ clients: [client({ phone: '555-0000' })] }, OWNER);
  const out = await editClientTool.execute!(
    { db, userId: OWNER },
    { id: 'cli-1', oldName: 'Maria Santos', oldPhone: null, oldEmail: 'maria@example.com', name: 'Maria Santos', phone: '555-0199', email: 'maria@example.com' },
    'action-1',
  );
  assert.equal(out.ok, false);
  assert.equal(db.updates, 0);
});
