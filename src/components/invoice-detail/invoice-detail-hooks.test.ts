// The renders of InvoiceDetailScreen:
//   pass 1  → no data yet → `if (!inv || !profile) return <InvoiceDetailSkeleton />`
//   pass 2  → data → the invoice body (or, for a quote, EstimateDetail)
//
// A hook placed BELOW that return is registered on pass 2 and not on pass 1, so
// React reports "Rendered more hooks than during the previous render" and the
// screen dies into the app error boundary. That is exactly the reported bug:
// Invoices crash, Estimates do not (a quote returns from the same early-return
// block, before the stray hook, so its hook count never changes).
//
// This test reads the source so the whole class of bug is caught without a DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FILE = 'src/components/invoice-detail/InvoiceDetailScreen.tsx';
const src = readFileSync(FILE, 'utf8');

/** Line number of a character offset, 1-indexed. */
const lineOf = (offset: number) => src.slice(0, offset).split('\n').length;

test('no hook is registered after the loading / estimate early returns', () => {
  const early = src.indexOf('if (!inv || !profile) return <InvoiceDetailSkeleton />');
  assert.ok(early > 0, 'the skeleton early return is where the hook boundary is');

  const hooks = [...src.matchAll(/\buse(?:State|Effect|Ref|Memo|Callback|Reducer|LayoutEffect|Id)\s*\(/g)]
    .filter((m) => (m.index ?? 0) > early)
    .map((m) => lineOf(m.index ?? 0));

  assert.deepEqual(hooks, [], `hooks called after the early return, at line(s): ${hooks.join(', ')}`);
});
