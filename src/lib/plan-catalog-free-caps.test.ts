// The catalog's free caps are the numbers the database enforces. Each SQL
// function is read from the LAST migration that (re)defines it, so a migration
// that changes a cap without the catalog (or the other way round) fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FREE_CAPS, PLAN_CATALOG } from './plan-catalog';

const DIR = 'supabase/migrations';

function sqlCap(fn: string): number {
  const re = new RegExp(String.raw`function public\.${fn}\(\)[\s\S]*?\$\$\s*select\s+(\d+)\s*\$\$`, 'i');
  const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
  let found: number | null = null;
  for (const f of files) {
    const m = readFileSync(join(DIR, f), 'utf8').match(re);
    if (m) found = Number(m[1]);
  }
  assert.ok(found !== null, `${fn}() is defined in a migration`);
  return found as number;
}

test('free caps: the catalog matches free_invoice_limit / free_estimate_limit / free_expense_limit', () => {
  assert.equal(FREE_CAPS.invoices, sqlCap('free_invoice_limit'));
  assert.equal(FREE_CAPS.estimates, sqlCap('free_estimate_limit'));
  assert.equal(FREE_CAPS.expenses, sqlCap('free_expense_limit'));
});

test('free caps are served in the catalog (/api/access planCatalog)', () => {
  assert.deepEqual(PLAN_CATALOG.freeCaps, FREE_CAPS);
});
