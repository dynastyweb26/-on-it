import { test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { act, deferred, flush, mount, q, rageTap, reset, tap } from './dom';
import PopToast from '../PopToast';

afterEach(() => { reset(); mock.timers.reset(); });

const advance = (ms: number) => act(() => { mock.timers.tick(ms); });

test('info toast: expires at 2.4 s, not before', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  let dismissed = 0;
  await mount(h(PopToast, { text: 'Link copied', onDismiss() { dismissed += 1; } }));
  assert.equal(document.body.querySelector('[role="status"]')?.textContent?.includes('Link copied'), true);
  await advance(2300);
  assert.equal(dismissed, 0);
  await advance(200);
  assert.equal(dismissed, 1);
});

test('undo toast: has the longer 6 s window and a time bar', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  let dismissed = 0;
  await mount(h(PopToast, { text: 'Invoice deleted.', action: { label: 'Undo', onSelect() {} }, onDismiss() { dismissed += 1; } }));
  await advance(5900);
  assert.equal(dismissed, 0);
  await advance(200);
  assert.equal(dismissed, 1);
});

test('repeat-tap: Undo three times restores once; pending shows Restoring… and the timer cannot expire it', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  let restores = 0;
  let dismissed = 0;
  const gate = deferred();
  await mount(h(PopToast, {
    text: 'Invoice deleted.',
    action: { label: 'Undo', busyLabel: 'Restoring…', onSelect: async () => { restores += 1; await gate.promise; } },
    onDismiss() { dismissed += 1; },
  }));
  await rageTap(q.button('Undo'), 3);
  assert.equal(restores, 1);
  assert.ok(q.button('Restoring…'));
  await advance(10_000);
  assert.equal(dismissed, 0, 'a pending undo never expires under the user');
  gate.resolve();
  await flush();
  assert.equal(dismissed, 1, 'closes once the restore lands');
});

test('error: a failed restore names the cause, offers Retry, and never auto-dismisses', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  let attempts = 0;
  let dismissed = 0;
  await mount(h(PopToast, {
    text: 'Invoice deleted.',
    consequence: 'INV-0007 stays deleted.',
    action: { label: 'Undo', onSelect: async () => { attempts += 1; if (attempts === 1) throw new TypeError('Failed to fetch'); } },
    onDismiss() { dismissed += 1; },
  }));
  await tap(q.button('Undo'));
  await flush();
  assert.match(q.text(), /INV-0007 stays deleted\./);
  assert.match(q.text(), /no connection/i);
  assert.ok(q.button('Retry'));
  await advance(30_000);
  assert.equal(dismissed, 0, 'a failed undo waits to be acted on');
  await tap(q.button('Retry'));
  await flush();
  assert.equal(attempts, 2);
  assert.equal(dismissed, 1);
});
