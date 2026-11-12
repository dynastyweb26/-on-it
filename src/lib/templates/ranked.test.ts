// RULES.md §6, item 5: five rows, "Show all N", and the tool's declared screen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { REGISTRY } from '@/lib/tools/registry';
import { RANKED_ROW_CAP, rankedView, type RankedSource } from './ranked';
import { RANKED_LIST_FIXTURE } from './fixtures';

const many = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    name: `Client ${i + 1}`,
    secondary: `INV-${String(i + 1).padStart(4, '0')}`,
    amount: '$100.00',
  }));

const source = (over: Partial<RankedSource> = {}): RankedSource => ({
  eyebrow: RANKED_LIST_FIXTURE.eyebrow,
  title: RANKED_LIST_FIXTURE.title,
  rows: many(12),
  totalCount: 18,
  total: RANKED_LIST_FIXTURE.total,
  destination: { screen: 'Invoices · unpaid', path: '/invoices?filter=unpaid' },
  ...over,
});

test('at most five rows are shown, even when the list is longer', () => {
  const view = rankedView(source());
  assert.equal(RANKED_ROW_CAP, 5);
  assert.equal(view.props.rows.length, 5);
  assert.deepEqual(view.props.rows.map((r) => r.name), [
    'Client 1',
    'Client 2',
    'Client 3',
    'Client 4',
    'Client 5',
  ]);
});

test('the count is the full total and the label is the design wording', () => {
  const view = rankedView(source({ totalCount: 18 }));
  assert.equal(view.props.totalCount, 18);
  assert.equal(view.hasMore, true);
  assert.equal(view.moreLabel, 'Show all 18');
});

test('Show all carries the destination the tool declares', () => {
  const view = rankedView(source());
  assert.deepEqual(view.destination, { screen: 'Invoices · unpaid', path: '/invoices?filter=unpaid' });
});

test('five or fewer rows means no link and no destination', () => {
  const view = rankedView(source({ rows: many(5), totalCount: 5 }));
  assert.equal(view.props.rows.length, 5);
  assert.equal(view.hasMore, false);
  assert.equal(view.moreLabel, null);
  assert.equal(view.destination, null);
});

test('a total smaller than the rows is refused instead of trimmed silently', () => {
  assert.throws(() => rankedView(source({ rows: many(6), totalCount: 4 })), /smaller than/);
});

test('every tool that uses list.ranked declares an in-app destination', () => {
  const ranked = REGISTRY.list.filter((tool) => tool.defaultTemplate.id === 'list.ranked');
  assert.ok(ranked.length > 0, 'the registry has a list.ranked tool');
  for (const tool of ranked) {
    assert.ok(tool.destination?.screen, `${tool.name} names a screen`);
    assert.match(tool.destination?.path ?? '', /^\//, `${tool.name} has an in-app path`);
  }
});
