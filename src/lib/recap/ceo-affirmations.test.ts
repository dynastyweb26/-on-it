import { test } from 'node:test';
import assert from 'node:assert/strict';
import { affirmationOrder, CEO_AFFIRMATIONS, pickAffirmation } from './ceo-affirmations';

const OWNERS = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
const LIST: readonly string[] = CEO_AFFIRMATIONS;
const inList = (line: string) => LIST.includes(line);

test('the list is the founder\'s, copied word for word', () => {
  assert.equal(CEO_AFFIRMATIONS.length, 16);
  assert.equal(CEO_AFFIRMATIONS[0], 'Keep showing up. The Lord will bless the works of your hands');
  assert.equal(CEO_AFFIRMATIONS[15], 'Worry not about end goal. Put in the work today!');
  assert.ok(CEO_AFFIRMATIONS.every((line) => line === line.trim() && line.length > 0));
});

test('an owner walks the whole list before any line repeats', () => {
  for (const userId of OWNERS) {
    const first = Array.from({ length: CEO_AFFIRMATIONS.length }, (_, i) => pickAffirmation(userId, i));
    assert.equal(new Set(first).size, CEO_AFFIRMATIONS.length, `${userId} repeated a line before using all of them`);
    assert.deepEqual(new Set(first), new Set(CEO_AFFIRMATIONS));
    // Only then does it wrap, and in the same order as the first lap.
    assert.deepEqual(first.map((_, i) => pickAffirmation(userId, i + CEO_AFFIRMATIONS.length)), first);
  }
});

test('the order is the owner\'s own, and the same every time', () => {
  assert.deepEqual(affirmationOrder(OWNERS[0]), affirmationOrder(OWNERS[0]));
  assert.equal(pickAffirmation(OWNERS[0], 3), pickAffirmation(OWNERS[0], 3));
  const orders = new Set(OWNERS.map((id) => affirmationOrder(id).join(',')));
  assert.equal(orders.size, OWNERS.length, 'two owners got the same walk');
});

test('count bounds the walk: fewer lines, still no repeats', () => {
  const picks = Array.from({ length: 5 }, (_, i) => pickAffirmation(OWNERS[0], i, 5));
  assert.equal(new Set(picks).size, 5);
  for (const line of picks) assert.ok(LIST.slice(0, 5).includes(line));

  // A nonsensical count never indexes off the list.
  for (const count of [0, -3, 0.5, Number.NaN, 999]) {
    const line = pickAffirmation(OWNERS[0], 0, count);
    assert.ok(inList(line), `count ${count} escaped the list`);
  }
});

test('a negative or fractional period index still lands on a real line', () => {
  for (const index of [-1, -17, 2.7, Number.NaN]) {
    assert.ok(inList(pickAffirmation(OWNERS[0], index)));
  }
  assert.equal(pickAffirmation(OWNERS[0], -1), pickAffirmation(OWNERS[0], CEO_AFFIRMATIONS.length - 1));
});

test('marked affirmations are the same lines, word for word, with 1-2 key phrases each', async () => {
  const { CEO_AFFIRMATIONS, CEO_AFFIRMATION_MARKS, stripMarks } = await import('./ceo-affirmations');
  assert.equal(CEO_AFFIRMATION_MARKS.length, CEO_AFFIRMATIONS.length);
  CEO_AFFIRMATION_MARKS.forEach((line, i) => {
    assert.equal(stripMarks(line), CEO_AFFIRMATIONS[i]);
    const phrases = line.match(/\[[^\[\]]+\]/g) ?? [];
    assert.ok(phrases.length >= 1 && phrases.length <= 2, line);
    assert.equal((line.match(/[\[\]]/g) ?? []).length, phrases.length * 2, line);
  });
});
