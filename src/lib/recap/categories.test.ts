import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA_COLORS, OTHER_COLOR, categoryColors, categoryLabel, ringSegments } from './categories';
import { fixturePayload } from './fixtures';

test('labels come from the app categories; unknown → Other', () => {
  assert.equal(categoryLabel('supplies'), 'Supplies');
  assert.equal(categoryLabel('other'), 'Other');
  assert.equal(categoryLabel('nope'), 'Other');
});

test('colours by rank: largest = data-1 (gold), then data-2..4; "other" always data-5', () => {
  const p = fixturePayload('normalWeek');   // supplies 154, fuel 38, tools 22
  const c = categoryColors(p);
  assert.deepEqual(p.spend.categories.map((x) => c(x.key)), [DATA_COLORS[0], DATA_COLORS[1], DATA_COLORS[2]]);
  const c2 = categoryColors({ spend: { ...p.spend, categories: [{ key: 'tools', amount: 9 }, { key: 'other', amount: 5 }] } });
  assert.equal(c2('tools'), DATA_COLORS[0]);
  assert.equal(c2('other'), OTHER_COLOR);
  assert.equal(c2('travel'), OTHER_COLOR);
});

test('ring segments: shares add to 100, first is the wide one, 1.2 gaps, never below 0.5', () => {
  const s = ringSegments([154, 38, 22]);
  assert.ok(Math.abs(s.reduce((a, x) => a + x.len, 0) - 100) < 1e-9);
  assert.deepEqual(s.map((x) => x.width), [22, 14, 14]);
  assert.ok(Math.abs(s[0].vis - (s[0].len - 1.2)) < 1e-9);
  assert.equal(s[1].start, s[0].len);
  assert.equal(ringSegments([100])[0].vis, 100);
  assert.equal(ringSegments([1000, 1])[1].vis, 0.5);
});
