// The pair's two pages each scroll themselves (LedgerPair.dc.html): one scroll
// container per page, so scrolling one never moves the other.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(
  join(process.cwd(), 'src', 'components', 'ledger', 'LedgerPair.tsx'),
  'utf8',
);

test('each page owns a vertical scroll container', () => {
  const panes = SRC.match(/data-pane-scroll=/g) ?? [];
  assert.equal(panes.length, 2, 'exactly two pages');
  assert.match(SRC, /data-pane-scroll="expenses"/);
  assert.match(SRC, /data-pane-scroll="income"/);
  // Each is scrollable and stops the scroll chaining into the page behind it.
  assert.equal((SRC.match(/overflow-y-auto/g) ?? []).length, 2);
  assert.equal((SRC.match(/overscroll-contain/g) ?? []).length, 2);
});

test('the pages do not share a scroll ref or nest inside one another', () => {
  assert.match(SRC, /ref=\{expensesScrollRef\}/);
  assert.match(SRC, /ref=\{incomeScrollRef\}/);
  const expensesAt = SRC.indexOf('data-pane-scroll="expenses"');
  const incomeAt = SRC.indexOf('data-pane-scroll="income"');
  assert.ok(expensesAt > 0 && incomeAt > expensesAt, 'the two are siblings in order');
  // The track itself only hides horizontal overflow; it must not scroll vertically.
  const track = SRC.slice(SRC.indexOf("width: '200%'") - 200, SRC.indexOf('width: \'200%\''));
  assert.equal(/overflow-y/.test(track), false);
});
