// ═══ BankToast — a failure never wears the success tick ═══
// "We couldn't open your bank" showed the gold check disc. Error toasts now
// pass tone="error" and render the error icon; success keeps the check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BankToast from './BankToast';
import { OPEN_BANK_FAILED_TOAST } from '@/lib/bank-connect';

const noop = () => {};

test('BankToast: an error toast shows the error icon, not the check', () => {
  const html = renderToStaticMarkup(createElement(BankToast, { message: OPEN_BANK_FAILED_TOAST, onDone: noop, tone: 'error' }));
  assert.match(html, /data-toast-tone="error"/);
  assert.match(html, /bg-error-container/);
  assert.doesNotMatch(html, />check</);
});

test('BankToast: a success toast keeps the gold check', () => {
  const html = renderToStaticMarkup(createElement(BankToast, { message: 'Disconnected.', onDone: noop }));
  assert.match(html, /data-toast-tone="done"/);
  assert.match(html, /bg-primary-container/);
});

test('BankAccountsScreen: the "couldn\'t open your bank" toast is sent as an error', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('./BankAccountsScreen.tsx', import.meta.url), 'utf8');
  assert.match(src, /setErrorToast\(OPEN_BANK_FAILED_TOAST\)/);
  assert.doesNotMatch(src, /setToast\(OPEN_BANK_FAILED_TOAST\)/);
});
