// ═══ Account tracking → backfill ═══
// The predicate is pure; the wiring (cursor reset + sync after the response) is
// read out of the route, because the route needs Supabase and a session.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { needsBackfill } from './account-tracking';

test('only false → true needs a backfill', () => {
  assert.equal(needsBackfill(false, true), true, 'tracking turned on');
  assert.equal(needsBackfill(false, false), false, 'still off');
  assert.equal(needsBackfill(true, true), false, 'already on, a no-op');
  assert.equal(needsBackfill(true, false), false, 'turned off: nothing to replay');
});

test('the accounts route resets the item cursor and syncs after the response', () => {
  const source = readFileSync(
    join(process.cwd(), 'src', 'app', 'api', 'plaid', 'accounts', 'route.ts'),
    'utf8',
  );
  // The previous value is read before the update, or nothing can tell a flip.
  assert.match(source, /\.select\('id, track'\)/, 'reads the previous track value');
  // The guard moved to the batch rules, which apply needsBackfill per change
  // (accounts-batch.test.ts pins that); the route still asks before it syncs.
  assert.match(source, /if \(backfillWanted\(current \?\? \[\], changes\)\)/, 'guards the backfill on the flip');
  assert.match(source, /sync_cursor: null/, 'resets the cursor so the window replays');
  assert.match(source, /waitUntil\(task\)/, 'does not block the response on the sync');
  assert.match(source, /syncPlaidItem\(client, admin, item_id, user\.id\)/, 'syncs that item');
});
