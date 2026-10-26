import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyTutorialsSeen,
  isTutorialTab,
  markTutorialSeen,
  parseTutorialsSeen,
  shouldAutoplay,
  TUTORIALS_SEEN_BACKFILL,
} from './tutorial-seen';

test('tutorial seen: new profiles start with every tab unseen', () => {
  assert.deepEqual(emptyTutorialsSeen(), {
    clients: false,
    invoices: false,
    chat: false,
    books: false,
    settings: false,
  });
});

test('tutorial seen: parses the jsonb object and ignores unknown keys', () => {
  assert.deepEqual(parseTutorialsSeen({ chat: true, invoices: false, extra: true }), {
    clients: false,
    invoices: false,
    chat: true,
    books: false,
    settings: false,
  });
});

test('tutorial seen: only a literal true counts', () => {
  assert.deepEqual(parseTutorialsSeen({ chat: 'yes', invoices: 1, clients: null }), {
    clients: false,
    invoices: false,
    chat: false,
    books: false,
    settings: false,
  });
});

test('tutorial seen: a malformed read is null (no autoplay)', () => {
  for (const bad of [null, undefined, '{}', [], 1, true]) {
    assert.equal(parseTutorialsSeen(bad), null);
  }
  assert.equal(shouldAutoplay(null, 'chat'), false);
});

test('tutorial seen: an empty object is a successful read', () => {
  assert.deepEqual(parseTutorialsSeen({}), emptyTutorialsSeen());
  assert.equal(shouldAutoplay({ ...emptyTutorialsSeen() }, 'chat'), true);
});

test('tutorial seen: marking one tab leaves the others alone', () => {
  const seen = markTutorialSeen(emptyTutorialsSeen(), 'chat');
  assert.equal(seen.chat, true);
  assert.equal(seen.invoices, false);
  assert.equal(shouldAutoplay(seen, 'chat'), false);
  assert.equal(shouldAutoplay(seen, 'invoices'), true);
});

test('tutorial seen: marking twice keeps the same object', () => {
  const once = markTutorialSeen(emptyTutorialsSeen(), 'books');
  assert.equal(markTutorialSeen(once, 'books'), once);
});

test('tutorial seen: tab guard rejects non-tutorial values', () => {
  assert.equal(isTutorialTab('chat'), true);
  assert.equal(isTutorialTab('dashboard'), false);
  assert.equal(isTutorialTab(''), false);
});

test('tutorial seen: backfill marks all five tabs', () => {
  assert.deepEqual(TUTORIALS_SEEN_BACKFILL, {
    clients: true,
    invoices: true,
    chat: true,
    books: true,
    settings: true,
  });
});
