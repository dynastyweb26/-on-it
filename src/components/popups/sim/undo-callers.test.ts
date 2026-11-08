// Every UndoToast caller must restore FIRST and throw on failure, so the toast
// can show "Restoring…" then the real cause with Retry. A handler that swallows
// the error (or closes the toast before the write) makes that state unreachable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CALLERS = [
  'src/components/ledger/ExpensesPane.tsx',
  'src/components/clients/ClientsList.tsx',
  'src/components/clients/ProductsList.tsx',
  'src/app/(app)/dashboard/recurring/page.tsx',
  'src/components/invoice-detail/InvoiceDetailScreen.tsx',
];

for (const file of CALLERS) {
  test(`undo caller throws on a failed restore: ${file}`, () => {
    const src = readFileSync(file, 'utf8');
    assert.match(src, /if \(error\) throw error;/, 'restore error must be thrown to the toast');
    assert.match(src, /<UndoToast[^>]*consequence=|<UndoToast\s[\s\S]*?consequence=/, 'names what happens if restore fails');
  });
}
