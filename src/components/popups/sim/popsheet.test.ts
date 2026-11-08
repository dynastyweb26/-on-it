import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { deferred, mount, pressEscape, q, rageTap, reset, settle, tap } from './dom';
import PopSheet from '../PopSheet';

afterEach(() => reset());

const base = {
  open: true as const,
  title: 'Delete this?',
  actions: [
    { label: 'Keep it', kind: 'gold' as const, safe: true },
    { label: 'Delete', kind: 'danger' as const, go: true, busyLabel: 'Deleting…' },
  ],
};

test('idle: opens as an alertdialog when destructive, a dialog when not', async () => {
  const a = await mount(h(PopSheet, { ...base, destructive: true, onDismiss() {} }));
  assert.equal(q.dialog()?.getAttribute('role'), 'alertdialog');
  await a.unmount();
  reset();
  await mount(h(PopSheet, { ...base, onDismiss() {} }));
  assert.equal(q.dialog()?.getAttribute('role'), 'dialog');
});

test('repeat-tap: three taps in one frame confirm once', async () => {
  let calls = 0;
  const gate = deferred();
  await mount(h(PopSheet, { ...base, onDismiss() {}, onConfirm: async () => { calls += 1; await gate.promise; } }));
  await rageTap(q.button('Delete'), 3);
  assert.equal(calls, 1);
  gate.resolve();
  await settle();
});

test('pending: label changes, controls lock, and every dismissal is ignored', async () => {
  let dismissed = 0;
  const gate = deferred();
  await mount(h(PopSheet, { ...base, onDismiss() { dismissed += 1; }, onConfirm: () => gate.promise }));
  await tap(q.button('Delete'));
  assert.ok(q.button('Deleting…'), 'busy label shows');
  assert.equal(q.dialog()?.getAttribute('aria-busy'), 'true');
  await pressEscape();
  await tap(q.byLabel('Keep it'));          // the × (aria-label = safe action)
  await tap(document.body.querySelector('.onit-composer-scrim'));
  await tap(q.button('Keep it'));
  assert.equal(dismissed, 0, 'scrim, ×, Escape and the safe button do nothing while pending');
  gate.resolve();
  await settle();
  assert.equal(dismissed, 1, 'success closes it once');
});

test('safe actions: ×, scrim, Escape and the safe button all dismiss, none confirms', async () => {
  for (const how of ['x', 'scrim', 'escape', 'button'] as const) {
    let dismissed = 0;
    let confirmed = 0;
    await mount(h(PopSheet, { ...base, onDismiss() { dismissed += 1; }, onConfirm() { confirmed += 1; } }));
    if (how === 'x') await tap(q.byLabel('Keep it'));
    if (how === 'scrim') await tap(document.body.querySelector('.onit-composer-scrim'));
    if (how === 'escape') await pressEscape();
    if (how === 'button') await tap(q.button('Keep it'));
    assert.equal(dismissed, 1, how);
    assert.equal(confirmed, 0, how);
    reset();
  }
});

test('error: a failure names the cause, says what did not happen, stays open and can be retried', async () => {
  let dismissed = 0;
  let attempts = 0;
  const offline = new TypeError('Failed to fetch');
  await mount(h(PopSheet, {
    ...base,
    consequence: 'Nothing was deleted.',
    onDismiss() { dismissed += 1; },
    onConfirm: async () => { attempts += 1; if (attempts === 1) throw offline; },
  }));
  await tap(q.button('Delete'));
  await settle();
  const alert = q.alert();
  assert.ok(alert, 'error slot renders as role=alert');
  assert.match(alert!.textContent ?? '', /Nothing was deleted\./);
  assert.match(alert!.textContent ?? '', /offline/i);
  assert.ok(!/Failed to fetch/.test(alert!.textContent ?? ''), 'raw error text is never shown');
  assert.equal(dismissed, 0, 'a failure does not close the sheet');
  assert.ok(q.button('Delete')?.disabled === false, 'pending cleared on the error exit');
  await tap(q.button('Delete'));
  await settle();
  assert.equal(attempts, 2);
  assert.equal(dismissed, 1);
});

test('typed confirm: the go action stays locked until the word matches', async () => {
  let confirmed = 0;
  await mount(h(PopSheet, { ...base, typed: 'DELETE', onDismiss() {}, onConfirm() { confirmed += 1; } }));
  await tap(q.button('Delete'));
  assert.equal(confirmed, 0, 'locked');
  const input = document.body.querySelector('input') as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  const { act } = await import('./dom');
  await act(() => { setter.call(input, 'delete'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  await tap(q.button('Delete'));
  assert.equal(confirmed, 1, 'case-insensitive match unlocks it');
});

// The P-03 / P-15 wiring: dismissal means "keep" (it resumes the saved draft),
// so a SUCCESSFUL confirm must close through onSuccess and must never run
// onDismiss, or Start new would resurrect the draft it just discarded.
test('success closes through onSuccess, not onDismiss, when the caller supplies one', async () => {
  let dismissed = 0;
  let succeeded = 0;
  await mount(h(PopSheet, { ...base, onDismiss() { dismissed += 1; }, onConfirm() {}, onSuccess() { succeeded += 1; } }));
  await tap(q.button('Delete'));
  await settle();
  assert.equal(succeeded, 1);
  assert.equal(dismissed, 0);
});

test('a failed confirm never runs onSuccess or onDismiss', async () => {
  let dismissed = 0;
  let succeeded = 0;
  await mount(h(PopSheet, { ...base, onDismiss() { dismissed += 1; }, onConfirm: async () => { throw { status: 500 }; }, onSuccess() { succeeded += 1; } }));
  await tap(q.button('Delete'));
  await settle();
  assert.equal(succeeded + dismissed, 0);
});
