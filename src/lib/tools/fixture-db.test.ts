import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureDb } from './fixture-db';

// The eval runner hands every case's fixture straight in. A case with no
// "fixture" key used to crash Object.entries() and take the whole run with it;
// an absent fixture is an empty account.

test('no fixture: an empty account, not a crash', async () => {
  const db = fixtureDb(undefined);
  assert.deepEqual(db.rows, {});
  const res = await db.select('invoices', { columns: '*', eq: { user_id: 'u1' } });
  assert.deepEqual(res, { data: [], error: null });
});

test('a fixture that omits a table answers an empty list for that table', async () => {
  const db = fixtureDb({ invoices: [] });
  const res = await db.select('invoice_payments', { columns: '*', eq: { user_id: 'u1' } });
  assert.deepEqual(res, { data: [], error: null });
});

test('rows are still copied, so a turn cannot change the fixture', () => {
  const rows = { invoices: [{ id: 'inv-1', total: 40 }] };
  const db = fixtureDb(rows);
  assert.notEqual(db.rows.invoices, rows.invoices);
  assert.equal(db.attempts, 0);
});
