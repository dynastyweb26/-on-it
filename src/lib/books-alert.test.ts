// ═══ The words and counts the Books alerts use ═══
// The tiles, the rows and the tab badge must agree on three things: the cue
// copy, the accessible label, and what the badge adds up. To review only —
// Ignored is a decision, so callers feed reviewQueue(), never ignoredQueue().
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  booksBadgeTotal, chargeCue, collectedAria, depositCue, spentAria,
} from './books-alert';

test('the cue line says one of the thing, or many', () => {
  assert.equal(depositCue(1), '1 deposit to review');
  assert.equal(depositCue(3), '3 deposits to review');
  assert.equal(chargeCue(1), '1 charge to review');
  assert.equal(chargeCue(2), '2 charges to review');
});

test('the collected label carries the count, and drops it at zero', () => {
  assert.equal(collectedAria('$998.00', 3), 'Collected, $998.00. 3 bank deposits to review. Open Income.');
  assert.equal(collectedAria('$998.00', 0), 'Collected, $998.00. Open Income.');
});

test('the spent label carries the count, and drops it at zero', () => {
  assert.equal(spentAria('$807.41', 1), 'Spent, $807.41. 1 bank charge to review. Open Expenses.');
  assert.equal(spentAria('$807.41', 4), 'Spent, $807.41. 4 bank charges to review. Open Expenses.');
  assert.equal(spentAria('$807.41', 0), 'Spent, $807.41. Open Expenses.');
});

test('the tab badge is the two counts together, and never negative', () => {
  assert.equal(booksBadgeTotal(2, 3), 5);
  assert.equal(booksBadgeTotal(0, 0), 0, 'hidden at zero');
  assert.equal(booksBadgeTotal(-1, 2), 2);
});
