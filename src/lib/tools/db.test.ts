import test from 'node:test';
import assert from 'node:assert/strict';
import { supabaseToolDb } from './db';

type OrderKey = { column: string; ascending: boolean; nullsFirst?: boolean };

/** A PostgREST-shaped client with a server max-rows cap and an exact count. */
function fakeClient(rows: Record<string, unknown>[], serverCap = 1000) {
  return {
    from: () => ({
      select: () => {
        let offset = 0;
        let limit = serverCap;
        const orders: OrderKey[] = [];
        const compare = (a: Record<string, unknown>, b: Record<string, unknown>) => {
          for (const order of orders) {
            const av = a[order.column];
            const bv = b[order.column];
            if (av === bv) continue;
            if (av == null) return order.nullsFirst ? -1 : 1;
            if (bv == null) return order.nullsFirst ? 1 : -1;
            const direction = av < bv ? -1 : 1;
            return order.ascending ? direction : -direction;
          }
          return 0;
        };
        const query = {
          eq: () => query,
          is: () => query,
          in: () => query,
          order: (column: string, options: { ascending: boolean; nullsFirst?: boolean }) => {
            orders.push({ column, ...options });
            return query;
          },
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
            const sorted = [...rows].sort(compare);
            let pageRows = sorted;
            // Real PostgREST makes no promise about equal keys. Rotate each
            // equal group per page to model a tie that is not unique.
            if (orders.length === 1) {
              pageRows = [];
              for (let i = 0; i < sorted.length; ) {
                let end = i + 1;
                while (end < sorted.length && compare(sorted[i], sorted[end]) === 0) end++;
                const group = sorted.slice(i, end);
                const shift = offset % group.length;
                pageRows.push(...group.slice(shift), ...group.slice(0, shift));
                i = end;
              }
            }
            resolve({ data: pageRows.slice(offset, offset + limit), error: null, count: rows.length });
          },
        };
        return query;
      },
    }),
  };
}

// Zero-padded so the primary-key order is also the creation order.
const manyRows = Array.from({ length: 2500 }, (_, i) => ({ id: `row-${String(i).padStart(4, '0')}` }));

test('a select reads every page instead of stopping at the server cap', async () => {
  const db = supabaseToolDb(fakeClient(manyRows) as never);
  const result = await db.select<{ id: string }>('rows', { columns: '*' });

  assert.equal(result.error, null);
  assert.equal(result.data?.length, 2500);
  assert.equal(result.data?.[0].id, 'row-0000');
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
  assert.deepEqual(result.data?.map((row) => row.id), ['row-0000', 'row-0001', 'row-0002']);
});

test('paging breaks duplicate order values by primary key, so no row repeats or goes missing', async () => {
  const rows = Array.from({ length: 2500 }, (_, i) => ({ id: `row-${i}`, bucket: i % 2 }));
  const db = supabaseToolDb(fakeClient(rows) as never);
  const result = await db.select<{ id: string; bucket: number }>('rows', {
    columns: '*',
    order: { column: 'bucket' },
  });

  assert.equal(result.error, null);
  assert.equal(result.data?.length, 2500);
  const ids = (result.data ?? []).map((row) => row.id);
  assert.equal(new Set(ids).size, 2500, 'every id appears exactly once');
  assert.deepEqual([...ids].sort(), rows.map((row) => row.id).sort());
});
