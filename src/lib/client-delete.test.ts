import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { UNSAVE_CLIENT_PATCH, unsaveClient, type ClientContactFields } from './client-delete';

const prev: ClientContactFields = {
  saved_at: '2026-01-02T03:04:05.000Z',
  phone: '555-0142',
  email: 'sam@example.com',
  address: '12 Oak St',
  notes: 'Gate code 42',
};

function stub(read: { data: ClientContactFields | null; error: { message: string } | null }, updateError: { message: string } | null = null) {
  const calls = { table: '', select: '', id: '', patch: null as Record<string, unknown> | null, updated: false };
  const client = {
    from(table: string) {
      calls.table = table;
      return {
        select(cols: string) {
          calls.select = cols;
          return {
            eq(_col: string, id: string) {
              calls.id = id;
              return { maybeSingle: async () => read };
            },
          };
        },
        update(patch: Record<string, unknown>) {
          calls.patch = patch;
          return {
            eq: async (_col: string, id: string) => {
              calls.id = id;
              calls.updated = true;
              return { error: updateError };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

test('unsaveClient clears saved_at and contacts, returning the undo snapshot', async () => {
  const { client, calls } = stub({ data: prev, error: null });
  const result = await unsaveClient(client, 'client-1');

  assert.deepEqual(result, { prev, error: null });
  assert.equal(calls.table, 'clients');
  assert.equal(calls.select, 'saved_at, phone, email, address, notes');
  assert.equal(calls.id, 'client-1');
  assert.deepEqual(calls.patch, UNSAVE_CLIENT_PATCH);
  assert.equal(calls.updated, true);
});

test('unsaveClient does not write when the read fails', async () => {
  const { client, calls } = stub({ data: null, error: { message: 'not found' } });
  const result = await unsaveClient(client, 'missing');

  assert.deepEqual(result, { prev: null, error: 'not found' });
  assert.equal(calls.updated, false);
});

test('unsaveClient keeps the undo snapshot when the update fails', async () => {
  const { client } = stub({ data: prev, error: null }, { message: 'network down' });
  const result = await unsaveClient(client, 'client-1');

  assert.deepEqual(result, { prev, error: 'network down' });
});
