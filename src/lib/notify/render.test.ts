import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderWebPush } from './render';

test('recap push: "Your week is ready" / "Your {Month} is ready", no numbers', () => {
  const w = renderWebPush({ type: 'recap', recapId: 'r1', kind: 'week', periodStart: '2026-09-21' });
  assert.equal(w.title, 'Your week is ready');
  assert.equal(w.body, 'Tap to see how you did.');
  assert.equal(w.url, '/dashboard?recap=r1');
  const m = renderWebPush({ type: 'recap', recapId: 'r2', kind: 'month', periodStart: '2026-09-01' });
  assert.equal(m.title, 'Your September is ready');
  assert.equal(m.body, 'Tap to see how you did.');
  assert.notEqual(w.tag, m.tag);
});

test('recurring skip digest: names the first item, counts the rest, no amounts', () => {
  const one = renderWebPush({ type: 'recurring_skipped', vendors: ['Rent'], localDate: '2026-10-08' });
  assert.equal(one.title, "Couldn't log Rent");
  assert.equal(one.body, 'Free limit reached. Tap to see your recurring expenses.');
  assert.equal(one.url, '/dashboard/recurring');
  const three = renderWebPush({ type: 'recurring_skipped', vendors: ['Rent', 'Gym Plus', 'Adobe'], localDate: '2026-10-08' });
  assert.equal(three.title, "Couldn't log Rent + 2 more");
  assert.equal(three.tag, one.tag); // a newer digest replaces the older on the device
  assert.doesNotMatch(three.title + three.body, /\$/);
});
