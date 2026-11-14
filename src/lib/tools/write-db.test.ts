// The WriteDb is the only surface a confirmed action writes through, so its
// refusals matter more than its success path: an update that does not name one
// row must not reach the database at all, and every update is scoped to the
// caller even when the payload asks for someone else's rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseWriteDb } from './write-db';

const OWNER = '11111111-1111-1111-1111-111111111111';

/** A client that records every call instead of talking to Supabase. */
function fakeClient() {
  const calls: Array<{ op: string; column?: string; value?: unknown }> = [];
  const builder: Record<string, unknown> = {};
  builder.update = (values: Record<string, unknown>) => {
    calls.push({ op: 'update', value: values });
    return builder;
  };
  builder.eq = (column: string, value: unknown) => {
    calls.push({ op: 'eq', column, value });
    return builder;
  };
  builder.is = (column: string) => {
    calls.push({ op: 'is', column });
    return builder;
  };
  // Awaiting the query runs it.
  builder.then = (resolve: (value: unknown) => unknown) => resolve({ error: null });
  return {
    client: {
      from: (table: string) => {
        calls.push({ op: 'from', value: table });
        return builder;
      },
    } as unknown as SupabaseClient,
    calls,
  };
}

test('an update with no id is refused before it touches the database', async () => {
  const { client, calls } = fakeClient();
  const db = supabaseWriteDb(client, OWNER);

  await assert.rejects(() => db.update('clients', { phone: '555' }, { eq: { name: 'Maria' } }), /id/);
  await assert.rejects(() => db.update('clients', { phone: '555' }, { eq: { id: '' } }), /id/);
  await assert.rejects(() => db.update('clients', { phone: '555' }, { eq: { id: '   ' } }), /id/);
  await assert.rejects(() => db.update('clients', { phone: '555' }, {}), /id/);

  assert.deepEqual(calls, [], 'nothing was built and nothing ran');
});

test('an update with an id is scoped to the caller', async () => {
  const { client, calls } = fakeClient();
  const db = supabaseWriteDb(client, OWNER);

  const { error } = await db.update('clients', { phone: '555' }, { eq: { id: 'cli-1' } });
  assert.equal(error, null);
  assert.deepEqual(
    calls.filter((call) => call.op === 'eq').map((call) => [call.column, call.value]),
    [['id', 'cli-1'], ['user_id', OWNER]],
  );
});

test('a payload cannot widen the update beyond the caller', async () => {
  const { client, calls } = fakeClient();
  const db = supabaseWriteDb(client, OWNER);

  await db.update(
    'clients',
    { phone: '555' },
    { eq: { id: 'cli-1', user_id: '22222222-2222-2222-2222-222222222222' } },
  );
  assert.deepEqual(
    calls.filter((call) => call.op === 'eq').map((call) => [call.column, call.value]),
    [['id', 'cli-1'], ['user_id', OWNER]],
    "the caller's own user_id wins",
  );
});
