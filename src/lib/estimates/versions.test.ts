import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  previousVersionCaption,
  previousVersionOf,
  snapshotView,
  versionChipLabel,
} from './versions';

const ROWS = [
  { version: 3, created_at: '2026-11-09T10:00:00.000Z' },
  { version: 1, created_at: '2026-11-07T15:00:00.000Z' },
  { version: 2, created_at: '2026-11-08T10:00:00.000Z' },
];

test('the version badge is hidden at v1', () => {
  assert.equal(versionChipLabel(1), null);
  assert.equal(versionChipLabel(0), null);
  assert.equal(versionChipLabel(null), null);
  assert.equal(versionChipLabel(undefined), null);
  assert.equal(versionChipLabel(1.5), null);
});

test('the version badge shows the current version from v2 on', () => {
  assert.equal(versionChipLabel(2), 'v2');
  assert.equal(versionChipLabel(12), 'v12');
});

test('the previous version is the newest snapshot below the current one', () => {
  assert.equal(previousVersionOf(ROWS, 3)?.version, 2);
  assert.equal(previousVersionOf(ROWS, 2)?.version, 1);
  // v1 has nothing below it, and a missing snapshot hides the link.
  assert.equal(previousVersionOf(ROWS, 1), null);
  assert.equal(previousVersionOf([], 2), null);
  // The current version is never its own previous version.
  assert.equal(previousVersionOf([{ version: 2 }], 2), null);
});

test('the caption names both versions and the previous one\'s own date', () => {
  assert.equal(previousVersionCaption(2, ROWS[1], 'UTC'), 'Editing v2 · v1 sent Nov 7');
  assert.equal(previousVersionCaption(3, ROWS[2], 'UTC'), 'Editing v3 · v2 sent Nov 8');
  // v1 has no previous version to caption.
  assert.equal(previousVersionCaption(1, ROWS[0], 'UTC'), null);
  assert.equal(previousVersionCaption(2, null, 'UTC'), null);
});

test('the snapshot view is read-only and carries the stored content', () => {
  const view = snapshotView(
    {
      version: 1,
      created_at: '2026-11-07T15:00:00.000Z',
      total: 50,
      content: {
        title: 'Bathroom door',
        subtotal: 50,
        tax_rate: 0,
        tax_amount: 0,
        total: 50,
        notes: 'Bring the hinge.',
        line_items: [{ description: 'Therapy Sessions', qty: 1, unit: 'hr', unit_price: 50 }],
      },
    },
    2,
    'UTC',
  );
  assert.equal(view.editable, false);
  assert.equal(view.viewingLabel, 'Viewing v1 · Nov 7');
  assert.equal(view.backLabel, 'Back to v2');
  assert.equal(view.title, 'Bathroom door');
  assert.deepEqual(view.items, [
    { description: 'Therapy Sessions', qty: 1, unit: 'hr', unitPrice: 50 },
  ]);
  assert.equal(view.total, 50);
  assert.equal(view.notes, 'Bring the hinge.');
  // Nothing writable is exposed, so the panel cannot render a control.
  assert.equal(Object.keys(view).some((k) => /change|save|setter|draft|edit/i.test(k) && k !== 'editable'), false);
});

test('a snapshot with no content still renders as display values', () => {
  const view = snapshotView({ version: 1, created_at: null, content: null }, 2, 'UTC');
  assert.equal(view.editable, false);
  assert.equal(view.viewingLabel, 'Viewing v1');
  assert.equal(view.backLabel, 'Back to v2');
  assert.deepEqual(view.items, []);
  assert.equal(view.total, 0);
});
