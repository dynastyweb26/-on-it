// The confirm card is the owner's last look before a client is saved, so its row
// has to say everything that is about to be written: the name in the summary and
// the contacts on a second line, composed by the server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClientTool } from './definitions/create_client';
import { fixtureDb } from './fixture-db';

const OWNER = '11111111-1111-1111-1111-111111111111';
const prepare = (args: { name: string; phone?: string; email?: string }) =>
  createClientTool.prepare!({ db: fixtureDb({}), userId: OWNER }, args as never);

test('the row shows the name and both contacts when they are given', async () => {
  const prepared = await prepare({ name: 'Maria Santos', phone: '555-0100', email: 'maria@example.com' });
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.equal(prepared.row.summary, 'Add client Maria Santos');
  assert.equal(prepared.row.detail, '555-0100 · maria@example.com');
  assert.equal(prepared.row.amount, '', 'adding a client moves no money');
});

test('the row shows only the contact that was given', async () => {
  const phoneOnly = await prepare({ name: 'Maria Santos', phone: '555-0100' });
  assert.equal(phoneOnly.ok, true);
  if (phoneOnly.ok) assert.equal(phoneOnly.row.detail, '555-0100');

  const emailOnly = await prepare({ name: 'Maria Santos', email: 'maria@example.com' });
  assert.equal(emailOnly.ok, true);
  if (emailOnly.ok) assert.equal(emailOnly.row.detail, 'maria@example.com');
});

test('a name with no contacts has no second line', async () => {
  const prepared = await prepare({ name: 'Maria Santos' });
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.equal(prepared.row.summary, 'Add client Maria Santos');
  assert.equal(prepared.row.detail, undefined);
});

test('the fixture preview draws the same row the card will show', () => {
  const preview = createClientTool.preview!;
  assert.equal(preview.row.summary, 'Add client Maria Santos');
  assert.equal(preview.row.detail, '555-0100 · maria@example.com');
});
