import test from 'node:test';
import assert from 'node:assert/strict';
import { supabaseToolDb } from './db';

/** A PostgREST-shaped client with a server max-rows cap and an exact count. */
function fakeClient(rows: Record<string, unknown>[], serverCap = 1000) {
  return {
    from: () => ({
      select: () => {
        let offset = 0;
        let limit = serverCap;
        const query = {
          eq: () => query,
          is: () => query,
          in: () => query,
          order: () => query,
          limit: (count: number) => {
            limit = Math.min(count, serverCap);
            return query;
          },
          range: (from: number, to: number) => {
            offset = from;
            limit = Math.min(to - from + 1, serverCap);
            return query;
          },
          then: (resolve: (value: { data: unknown[]; error: null; count: number }) => void) => {
            resolve({ data: rows.slice(offset, offset + limit), error: null, count: rows.length });
          },
        };
        return query;
      },
    }),
  };
}

const manyRows = Array.from({ length: 2500 }, (_, i) => ({ id: `row-${i}` }));

test('a select reads every page instead of stopping at the server cap', async () => {
  const db = supabaseToolDb(fakeClient(manyRows) as never);
  const result = await db.select<{ id: string }>('rows', { columns: '*' });

  assert.equal(result.error, null);
  assert.equal(result.data?.length, 2500);
  assert.equal(result.data?.[0].id, 'row-0');
  assert.equal(result.data?.[2499].id, 'row-2499');
});

test('a read cut off below one page fails loudly instead of returning partial data', async () => {
  const db = supabaseToolDb(fakeClient(manyRows, 700) as never);
  const result = await db.select<{ id: string }>('rows', { columns: '*' });

  assert.equal(result.data, null);
  assert.match(result.error?.message ?? '', /cut off at 700 of 2500 rows/);
});

test('an explicit limit is still one bounded read', async () => {
  const db = supabaseToolDb(fakeClient(manyRows) as never);
  const result = await db.select<{ id: string }>('rows', { columns: '*', limit: 3 });

  assert.equal(result.error, null);
  assert.deepEqual(result.data?.map((row) => row.id), ['row-0', 'row-1', 'row-2']);
});
