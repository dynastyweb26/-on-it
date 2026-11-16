import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CEO_AFFIRMATIONS, CEO_AFFIRMATION_MARKS, pickAffirmation, stripMarks } from '@/lib/recap/ceo-affirmations';
import { pickMarkedAffirmation } from './aff-line';

test('the marked line is the very line pickAffirmation picks, for any owner and recap number', () => {
  for (const user of ['owner-1', 'owner-2', '', 'a8f3-user']) {
    for (let n = 0; n < 40; n++) {
      const marked = pickMarkedAffirmation(user, n);
      assert.equal(stripMarks(marked), pickAffirmation(user, n), `${user}/${n}`);
      assert.ok(CEO_AFFIRMATION_MARKS.includes(marked as (typeof CEO_AFFIRMATION_MARKS)[number]));
    }
  }
});

test('one owner walks all 16 marked lines before any repeats', () => {
  const seen = new Set(Array.from({ length: CEO_AFFIRMATIONS.length }, (_, n) => pickMarkedAffirmation('owner-1', n)));
  assert.equal(seen.size, CEO_AFFIRMATIONS.length);
});

test('a recap number that is missing or odd still lands on a line', () => {
  assert.equal(stripMarks(pickMarkedAffirmation('owner-1', Number.NaN)), pickAffirmation('owner-1', Number.NaN));
  assert.equal(stripMarks(pickMarkedAffirmation('owner-1', -3)), pickAffirmation('owner-1', -3));
});
