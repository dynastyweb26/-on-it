import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('the chip rule is unchanged: v2 needs both a snapshot time and a client view', () => {
  // Restyled only — the rule is still version > 1 AND snapshot newer than the
  // client's last view AND a client view exists at all.
  assert.equal(isUpdatedSinceView({ version: 2, versionAt: null, views: [{ viewedAt: BEFORE }] }), false);
  assert.equal(isUpdatedSinceView({ version: 2, versionAt: V2, views: [] }), false);
  assert.equal(isUpdatedSinceView({ version: 2, versionAt: BEFORE, views: [{ viewedAt: BEFORE }] }), false);
});

test('the client page keeps the derived tag and gains no version badge', () => {
  const view = readFileSync('src/components/estimate/EstimateView.tsx', 'utf8');
  assert.match(view, /payload\.updated === true/);
  assert.doesNotMatch(view, /estimateVersion|estimate_version|versionChipLabel/);
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
