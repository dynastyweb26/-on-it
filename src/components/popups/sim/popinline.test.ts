import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { deferred, mount, q, rageTap, reset, settle, tap } from './dom';
import PopInline from '../PopInline';

afterEach(() => reset());

test('idle: a prompt is a group with no close control (it cannot be dismissed)', async () => {
  await mount(h(PopInline, { text: 'Which?', actions: [{ label: 'Go', onSelect() {} }] }));
  assert.ok(document.body.querySelector('[role="group"]'));
  assert.equal(document.body.querySelector('[aria-label="Close"],[aria-label="Dismiss"]'), null);
});

test('repeat-tap: three taps in one frame run the action once', async () => {
  let calls = 0;
  const gate = deferred();
  await mount(h(PopInline, { text: 'Update?', actions: [{ label: 'Update', kind: 'gold', onSelect: async () => { calls += 1; await gate.promise; } }] }));
  await rageTap(q.button('Update'), 3);
  assert.equal(calls, 1);
  gate.resolve();
  await settle();
});

test('pending: busy label shows, every other control locks, then it clears', async () => {
  const gate = deferred();
  let other = 0;
  await mount(h(PopInline, {
    text: 'Pick',
    actions: [
      { label: 'Yes', kind: 'gold', busyLabel: 'Asking…', onSelect: () => gate.promise },
      { label: 'Not now', onSelect() { other += 1; } },
    ],
    choices: [{ label: 'Brandon', onSelect() { other += 1; } }],
  }));
  await tap(q.button('Yes'));
  assert.ok(q.button('Asking…'), 'busy label');
  await tap(q.button('Not now'));
  await tap(q.button('Brandon'));
  assert.equal(other, 0, 'nothing else can be tapped while pending');
  gate.resolve();
  await settle();
  assert.ok(q.button('Yes'), 'busy label cleared on success');
  await tap(q.button('Not now'));
  assert.equal(other, 1, 'controls are live again');
});

test('error: a failure is an alert that names the cause and keeps the card', async () => {
  let n = 0;
  await mount(h(PopInline, {
    text: 'Update it?',
    consequence: "INV-0007 wasn't changed.",
    actions: [{ label: 'Update', onSelect: async () => { n += 1; if (n === 1) throw new TypeError('Failed to fetch'); } }],
  }));
  await tap(q.button('Update'));
  await settle();
  const alert = q.alert();
  assert.ok(alert);
  assert.match(alert!.textContent ?? '', /INV-0007 wasn't changed\./);
  assert.match(alert!.textContent ?? '', /offline/i);
  assert.ok(q.button('Update'), 'the card and its action are still there');
  await tap(q.button('Update'));
  await settle();
  assert.equal(n, 2, 'a retry runs');
  assert.equal(q.alert(), null, 'the error clears once it works');
});

test('error: signed-out is named as signed out, not as a network problem', async () => {
  await mount(h(PopInline, {
    text: 'Save?',
    actions: [{ label: 'Save', onSelect: async () => { throw { status: 401 }; } }],
  }));
  await tap(q.button('Save'));
  await settle();
  assert.match(q.alert()?.textContent ?? '', /signed out/i);
  assert.ok(!/connection|offline/i.test(q.alert()?.textContent ?? ''));
});

test('error: a static error prop renders as an alert (the mic "still blocked" slot)', async () => {
  await mount(h(PopInline, { text: 'Mic', error: { title: 'Still blocked', body: 'Use the steps.' }, actions: [{ label: 'Try again', onSelect() {} }] }));
  assert.match(q.alert()?.textContent ?? '', /Still blocked/);
});

test('rows: only the changed fields render, old value struck through', async () => {
  await mount(h(PopInline, { text: 'x', rows: [{ k: 'Total', from: '$200.00', to: '$450.00' }] }));
  assert.match(q.text(), /\$200\.00/);
  assert.ok(document.body.querySelector('.line-through'));
});
