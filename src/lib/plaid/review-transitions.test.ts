// ═══ The review state machine, exhaustively ═══
// Every action against every review state, with and without a linked expense,
// plus the bank-removed gate. A missing cell would be a silent write.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_FROM, NEXT_STATE, REVIEW_ACTIONS, transition, type ReviewActionName,
} from './review-transitions';

const STATES = ['new', 'added', 'already', 'ignored', 'needs_review', 'something_new'] as const;

const at = (action: ReviewActionName, reviewState: string, expenseId: string | null = null) =>
  transition({ action, reviewState, expenseId });

test('the table names exactly the four decisions', () => {
  assert.deepEqual([...REVIEW_ACTIONS], ['add', 'already', 'ignore', 'restore']);
  assert.deepEqual({ ...NEXT_STATE }, { add: 'added', already: 'already', ignore: 'ignored', restore: 'new' });
  assert.deepEqual([...ALLOWED_FROM.ignore], ['new', 'needs_review']);
  assert.deepEqual([...ALLOWED_FROM.restore], ['ignored']);
  assert.deepEqual([...ALLOWED_FROM.already], ['new', 'needs_review', 'ignored']);
});

test('ignore works only on an open row and never on a linked one', () => {
  for (const state of STATES) {
    const expected = state === 'new' || state === 'needs_review';
    assert.equal(at('ignore', state).kind, expected ? 'ok' : 'bad_state', `ignore from ${state}`);
    assert.equal(at('ignore', state, 'exp-1').kind, 'bad_state', `ignore from linked ${state}`);
  }
  assert.deepEqual(at('ignore', 'new'), { kind: 'ok', next: 'ignored' });
});

test('restore works only from ignored', () => {
  for (const state of STATES) {
    const expected = state === 'ignored';
    assert.equal(at('restore', state).kind, expected ? 'ok' : 'bad_state', `restore from ${state}`);
    assert.equal(at('restore', state, 'exp-1').kind, 'bad_state', `restore from linked ${state}`);
  }
  assert.deepEqual(at('restore', 'ignored'), { kind: 'ok', next: 'new' });
});

test('already works from open or ignored, never from a decided row', () => {
  for (const state of STATES) {
    const expected = state === 'new' || state === 'needs_review' || state === 'ignored';
    assert.equal(at('already', state).kind, expected ? 'ok' : 'bad_state', `already from ${state}`);
    // Even a decided row without a link is refused: the state itself decides.
    assert.equal(at('already', state, 'exp-1').kind, 'bad_state', `already from linked ${state}`);
  }
  assert.deepEqual(at('already', 'ignored'), { kind: 'ok', next: 'already' });
});

test('add is idempotent for a decided row and refuses a removed charge', () => {
  assert.deepEqual(at('add', 'new'), { kind: 'ok', next: 'added' });
  assert.deepEqual(at('add', 'needs_review'), { kind: 'ok', next: 'added' });
  assert.deepEqual(at('add', 'ignored'), { kind: 'ok', next: 'added' }, 'a passed-on charge can still be added');
  assert.deepEqual(at('add', 'something_new'), { kind: 'ok', next: 'added' });

  assert.deepEqual(at('add', 'added', 'exp-1'), { kind: 'replay' }, 'double submit');
  assert.deepEqual(at('add', 'already', 'exp-1'), { kind: 'replay' });
  // A decided state with no expense violates the schema: refuse, never re-add.
  assert.deepEqual(at('add', 'added'), { kind: 'bad_state' });
  assert.deepEqual(at('add', 'already'), { kind: 'bad_state' });

  for (const state of STATES) {
    assert.deepEqual(
      transition({ action: 'add', reviewState: state, expenseId: 'exp-1', bankState: 'removed' }).kind,
      'bad_state',
      `removed add from ${state}`,
    );
    assert.deepEqual(
      transition({ action: 'add', reviewState: state, removedAt: '2026-10-29T10:00:00.000Z' }).kind,
      'bad_state',
      `removed_at add from ${state}`,
    );
  }
  // Only add carries the removed gate: the others are already state-limited.
  assert.deepEqual(transition({ action: 'restore', reviewState: 'ignored', bankState: 'removed' }), { kind: 'ok', next: 'new' });
});

test('every action × every state is decided, with no accidental ok', () => {
  for (const action of REVIEW_ACTIONS) {
    for (const state of STATES) {
      const result = at(action, state);
      if (result.kind === 'ok') {
        assert.equal(result.next, NEXT_STATE[action], `${action} from ${state} lands on its state`);
        if (action !== 'add') assert.ok(ALLOWED_FROM[action].includes(state), `${action} from ${state} is listed`);
      } else {
        assert.ok(result.kind === 'bad_state', `${action} from ${state} is a 409`);
      }
    }
  }
});
