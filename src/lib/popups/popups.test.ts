import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PopInline from './PopInline';
import PopToast from './PopToast';
import {
  TOAST_INFO_MS, TOAST_UNDO_MS, TapLock, canDismiss, toastLifetime, typedConfirmOk,
} from './action-guard';
import { ERROR_TITLE, popupError } from './error-frame';
import { ERROR_MESSAGE } from '../errors';

// ═══ The busy rule: a ref, not state ═══
test('a second tap in the same frame is refused', () => {
  const lock = new TapLock();
  assert.equal(lock.tryLock(), true, 'the first tap starts the request');
  assert.equal(lock.locked, true);
  assert.equal(lock.tryLock(), false, 'the second tap is a no-op');
});

test('a settled request unlocks, so the button can retry', () => {
  const lock = new TapLock();
  lock.tryLock();
  lock.unlock();
  assert.equal(lock.locked, false);
  assert.equal(lock.tryLock(), true, 'Retry starts a fresh request');
});

test('dismissal is refused while the request runs', () => {
  const lock = new TapLock();
  assert.equal(canDismiss(false, lock), true, 'idle: scrim/×/swipe/Escape are the safe answer');
  lock.tryLock();
  assert.equal(canDismiss(false, lock), false, 'the ref alone blocks an early dismiss');
  lock.unlock();
  assert.equal(canDismiss(true, lock), false, 'the rendered pending state also blocks');
  assert.equal(canDismiss(false, undefined), true, 'a primitive without a caller lock still works');
});

// ═══ Typed confirmation ═══
test('typed DELETE passes only on an exact, case-insensitive match', () => {
  assert.equal(typedConfirmOk('delete', 'DELETE'), true);
  assert.equal(typedConfirmOk('  DELETE ', 'DELETE'), true);
  assert.equal(typedConfirmOk('DELET', 'DELETE'), false);
  assert.equal(typedConfirmOk('', 'DELETE'), false);
  assert.equal(typedConfirmOk('anything', undefined), true, 'no word to type = nothing to gate');
});

// ═══ Toast lifetimes ═══
test('info toasts glance, undo toasts wait', () => {
  assert.equal(toastLifetime(false), TOAST_INFO_MS);
  assert.equal(toastLifetime(true), TOAST_UNDO_MS);
  assert.equal(TOAST_INFO_MS, 2400);
  assert.equal(TOAST_UNDO_MS, 6000);
});

// ═══ Failures name the cause and what did NOT happen ═══
test('every errors.ts cause has a popup title and a full sentence', () => {
  for (const kind of Object.keys(ERROR_MESSAGE) as Array<keyof typeof ERROR_MESSAGE>) {
    const frame = popupError({ status: 0, code: 'X', message: '__probe__' });
    assert.ok(ERROR_TITLE[kind], `${kind} has no title`);
    assert.ok(frame.body.length > 0);
  }
});

test('a signed-out write says nothing happened and why', () => {
  const frame = popupError({ status: 401 }, { notDone: 'Nothing was deleted.' });
  assert.equal(frame.kind, 'signed_out');
  assert.equal(frame.title, ERROR_TITLE.signed_out);
  assert.equal(frame.body, `Nothing was deleted. ${ERROR_MESSAGE.signed_out}`);
});

test('a network throw reads as offline, a 500 as ours', () => {
  assert.equal(popupError(new TypeError('Failed to fetch')).kind, 'offline');
  assert.equal(popupError({ status: 500 }).title, 'It broke on our end');
});

// ═══ PopInline renders every state the board draws ═══
test('a pending inline prompt disables its answers and shows the busy label', () => {
  const html = renderToStaticMarkup(createElement(PopInline, {
    kind: 'card',
    eyebrow: 'THIS WOULD CHANGE INV-0007',
    title: 'This would change INV-0007. Update it, or start a new invoice?',
    pending: true,
    actions: [
      { id: 'cancel', label: 'Start a new invoice', kind: 'outline' },
      { id: 'go', label: 'Update INV-0007', busyLabel: 'Updating…', kind: 'gold', go: true },
    ],
  }));
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /Updating…/);
  assert.deepEqual((html.match(/<button[^>]*disabled=""/g) ?? []).length, 2);
});

test('an inline failure carries the cause, what did not happen, and a retry', () => {
  const html = renderToStaticMarkup(createElement(PopInline, {
    kind: 'slot',
    text: 'Update INV-0007?',
    alert: popupError({ status: 401 }, { notDone: 'INV-0007 wasn’t changed.' }),
    retryLabel: 'Try again',
    actions: [{ id: 'go', label: 'Update INV-0007', kind: 'gold', go: true }],
  }));
  assert.match(html, /role="alert"/);
  assert.match(html, /You’ve been signed out/);
  assert.match(html, /INV-0007 wasn’t changed\./);
  assert.match(html, /Try again/);
});

// ═══ PopToast is a status, not a dialog ═══
test('an undo toast is announced and carries its action and time bar', () => {
  const html = renderToStaticMarkup(createElement(PopToast, {
    text: 'Invoice deleted.',
    icon: 'delete',
    action: { label: 'Undo', busyLabel: 'Restoring…' },
    doneText: 'INV-0007 is back.',
    onDismiss: () => {},
  }));
  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /Invoice deleted\./);
  assert.match(html, /Undo/);
  assert.match(html, /pop-toast-bar/);
  assert.match(html, /animation-duration:6000ms/);
});

test('an info toast has no action and no timer bar', () => {
  const html = renderToStaticMarkup(createElement(PopToast, { text: 'Link copied.', onDismiss: () => {} }));
  assert.match(html, /role="status"/);
  assert.doesNotMatch(html, /pop-toast-bar/);
  assert.doesNotMatch(html, /<button/);
});
