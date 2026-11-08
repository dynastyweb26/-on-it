import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isUpdatedSinceView } from './updated';

const V1 = '2026-11-01T10:00:00.000Z';
const V2 = '2026-11-03T10:00:00.000Z';
const BEFORE = '2026-11-02T10:00:00.000Z';
const AFTER = '2026-11-04T10:00:00.000Z';

test('a v1 the client never opened is never Updated', () => {
  assert.equal(isUpdatedSinceView({ version: 1, versionAt: V1, views: [] }), false);
});

test('v2 published after a client view is Updated', () => {
  assert.equal(isUpdatedSinceView({ version: 2, versionAt: V2, views: [{ viewedAt: BEFORE }] }), true);
});

test('a newer client view clears the tag', () => {
  assert.equal(isUpdatedSinceView({ version: 2, versionAt: V2, views: [{ viewedAt: AFTER }] }), false);
});

test('an owner view does not count as a client view', () => {
  // Owner-only rows leave the link unchanged: still no client view, no tag.
  assert.equal(
    isUpdatedSinceView({ version: 2, versionAt: V2, views: [{ viewedAt: AFTER, byOwner: true }] }),
    false,
  );
  // An owner view after the publish does not clear a client view from before it.
  assert.equal(
    isUpdatedSinceView({
      version: 2, versionAt: V2,
      views: [{ viewedAt: BEFORE }, { viewedAt: AFTER, byOwner: true }],
    }),
    true,
  );
});
