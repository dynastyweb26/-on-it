// ═══ Batch tracking rules ═══
// The route calls these before it writes: an id outside the caller's item
// refuses the whole request, and only an off → on change replays the window.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_TRACK_CHANGES, backfillWanted, trackGroups, unknownAccountIds,
  type AccountState, type TrackChange,
} from './accounts-batch';

const KNOWN: AccountState[] = [
  { id: 'a1', track: false },
  { id: 'a2', track: true },
  { id: 'a3', track: null },
];

test('every account must belong to the caller, or the request is refused', () => {
  assert.deepEqual(unknownAccountIds(KNOWN, [{ account_id: 'a1', track: true }]), []);
  assert.deepEqual(
    unknownAccountIds(KNOWN, [{ account_id: 'a1', track: true }, { account_id: 'nope', track: true }]),
    ['nope'],
  );
});

test('only a false → true change asks for the backfill', () => {
  const changes = (account_id: string, track: boolean): TrackChange[] => [{ account_id, track }];
  assert.equal(backfillWanted(KNOWN, changes('a1', true)), true, 'off → on');
  assert.equal(backfillWanted(KNOWN, changes('a3', true)), true, 'never tracked → on');
  assert.equal(backfillWanted(KNOWN, changes('a2', true)), false, 'already on');
  assert.equal(backfillWanted(KNOWN, changes('a1', false)), false, 'off stays off');
  assert.equal(backfillWanted(KNOWN, changes('a2', false)), false, 'on → off');
});

test('one backfill decision for the whole batch, whatever its size', () => {
  const changes: TrackChange[] = [
    { account_id: 'a2', track: false },
    { account_id: 'a1', track: true },
    { account_id: 'a3', track: true },
  ];
  assert.equal(backfillWanted(KNOWN, changes), true);
  assert.deepEqual(trackGroups(changes), [
    { track: true, ids: ['a1', 'a3'] },
    { track: false, ids: ['a2'] },
  ]);
});

test('the batch ceiling is 50 and only present values make a group', () => {
  assert.equal(MAX_TRACK_CHANGES, 50);
  assert.deepEqual(trackGroups([{ account_id: 'a1', track: true }]), [{ track: true, ids: ['a1'] }]);
  assert.deepEqual(trackGroups([]), []);
});
