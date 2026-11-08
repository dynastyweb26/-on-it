import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canDismiss, matchesTypedWord, resolveSheetActions, safeActionLabel, sheetRole,
  type SheetActionSpec,
} from './sheet';

const ACTIONS: SheetActionSpec[] = [
  { label: 'Cancel', kind: 'gold', safe: true },
  { label: 'Delete payment · $85.00 Zelle', kind: 'danger', go: true, busyLabel: 'Deleting…' },
];

const idle = { pending: false, error: false, typedOk: true };

test('canDismiss: never while a request is in flight', () => {
  assert.equal(canDismiss(false), true);
  assert.equal(canDismiss(true), false);
});

test('sheetRole: destructive work is an alertdialog', () => {
  assert.equal(sheetRole(true), 'alertdialog');
  assert.equal(sheetRole(false), 'dialog');
  assert.equal(sheetRole(undefined), 'dialog');
});

test('safeActionLabel: names the dismissal, falls back to Close', () => {
  assert.equal(safeActionLabel(ACTIONS), 'Cancel');
  assert.equal(safeActionLabel([{ label: 'Delete', go: true }]), 'Close');
});

test('matchesTypedWord: case and surrounding space do not matter', () => {
  assert.equal(matchesTypedWord('delete', 'DELETE'), true);
  assert.equal(matchesTypedWord('  Delete ', 'DELETE'), true);
  assert.equal(matchesTypedWord('del', 'DELETE'), false);
  assert.equal(matchesTypedWord('', 'DELETE'), false);
  assert.equal(matchesTypedWord('', undefined), true);
});

test('resolveSheetActions: idle shows the promised labels', () => {
  const views = resolveSheetActions(ACTIONS, idle);
  assert.equal(views[0].label, 'Cancel');
  assert.equal(views[1].label, 'Delete payment · $85.00 Zelle');
  assert.equal(views[1].busy, false);
  assert.equal(views[1].disabled, false);
});

test('resolveSheetActions: pending spins only the go action and locks both', () => {
  const views = resolveSheetActions(ACTIONS, { ...idle, pending: true });
  assert.equal(views[1].busy, true);
  assert.equal(views[1].label, 'Deleting…');
  assert.equal(views[1].disabled, true);
  assert.equal(views[1].muted, false); // spinning, not dimmed
  assert.equal(views[0].disabled, true);
  assert.equal(views[0].muted, true);
  assert.equal(views[0].busy, false);
});

test('resolveSheetActions: an unmatched typed word keeps the go action closed', () => {
  const views = resolveSheetActions(ACTIONS, { ...idle, typedOk: false });
  assert.equal(views[1].disabled, true);
  assert.equal(views[0].disabled, false); // the safe answer stays available
});

test('resolveSheetActions: after a failure the go action offers the retry', () => {
  const views = resolveSheetActions(ACTIONS, { ...idle, error: true, retryLabel: 'Try again' });
  assert.equal(views[1].label, 'Try again');
  assert.equal(views[0].label, 'Cancel');
});

test('resolveSheetActions: a caller-side gate disables without a word change', () => {
  const views = resolveSheetActions([{ label: 'Save', go: true, disabled: true }], idle);
  assert.equal(views[0].label, 'Save');
  assert.equal(views[0].disabled, true);
  assert.equal(views[0].muted, true);
});
