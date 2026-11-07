import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_MESSAGE, type ErrorKind } from '../errors';
import { ERROR_ICON, ERROR_TITLE, popupFailure } from './failure';

const KINDS = Object.keys(ERROR_MESSAGE) as ErrorKind[];

test('every error cause has a title and an icon', () => {
  for (const kind of KINDS) {
    assert.ok(ERROR_TITLE[kind], `${kind} has no title`);
    assert.ok(ERROR_ICON[kind], `${kind} has no icon`);
  }
});

test('popupFailure: an offline rejection reads as offline, not as our fault', () => {
  const original = console.error;
  console.error = () => {};
  try {
    const failure = popupFailure(new TypeError('Failed to fetch'));
    assert.equal(failure.title, ERROR_TITLE.offline);
    assert.equal(failure.body, ERROR_MESSAGE.offline);
    assert.equal(failure.icon, ERROR_ICON.offline);
  } finally {
    console.error = original;
  }
});

test('popupFailure: the consequence says what did not happen', () => {
  const original = console.error;
  console.error = () => {};
  try {
    const failure = popupFailure({ status: 500 }, 'Nothing was deleted.');
    assert.equal(failure.title, ERROR_TITLE.our_end);
    assert.ok(failure.body.startsWith('Nothing was deleted.'));
    assert.ok(failure.body.includes(ERROR_MESSAGE.our_end));
  } finally {
    console.error = original;
  }
});

test('popupFailure: a signed-out 401 is its own cause', () => {
  const original = console.error;
  console.error = () => {};
  try {
    assert.equal(popupFailure({ status: 401 }).title, ERROR_TITLE.signed_out);
  } finally {
    console.error = original;
  }
});
