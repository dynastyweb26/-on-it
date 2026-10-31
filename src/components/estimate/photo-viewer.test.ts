// The viewer's exit control (design spec §2.5): one back arrow, 44px, clear of
// the notch. The drag that also closes the viewer is pure and covered by
// src/lib/photo-dismiss.test.ts; this file pins the button and the fact that the
// viewer has exactly one way out on screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ViewerBackButton from './ViewerBackButton';

const html = renderToStaticMarkup(createElement(ViewerBackButton, { onClose: () => {} }));

test('the back arrow is a single, labelled button with an inline arrow', () => {
  assert.match(html, /^<button/);
  assert.match(html, /type="button"/);
  assert.match(html, /aria-label="Back"/);
  assert.equal((html.match(/<button/g) ?? []).length, 1, 'one control, not a button inside a button');
  assert.match(html, /<svg[^>]*aria-hidden="true"/, 'the arrow is decorative; the button carries the name');
});

test('44px target, clear of the notch', () => {
  assert.match(html, /width:44px/);
  assert.match(html, /height:44px/);
  assert.match(html, /safe-area-inset-left/, 'the arrow must not sit under the notch');
});

test('PhotoViewer renders it once and keeps no second close control', () => {
  // Structural guard: the X was removed when the arrow landed, and a second exit
  // control beside it is exactly what this item rules out. PhotoViewer imports
  // the estimate CSS module, which Node cannot load, so its one exit control is
  // checked in the source rather than in rendered markup.
  const source = readFileSync(new URL('./PhotoViewer.tsx', import.meta.url), 'utf8');
  assert.equal((source.match(/<ViewerBackButton/g) ?? []).length, 1);
  assert.ok(!source.includes('aria-label="Close photo"'), 'the old close X is gone');
  assert.ok(!source.includes('name="close"'), 'no close glyph left in the viewer');
});
