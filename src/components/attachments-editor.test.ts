// The attachment control renders as a gold text button, hides when read-only,
// and disables at the six-image cap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AttachmentsEditor, { type EditorAttachment } from './AttachmentsEditor';

const items = (n: number): EditorAttachment[] =>
  Array.from({ length: n }, (_, i) => ({ id: `a${i}`, previewUrl: `blob:test-${i}` }));

const render = (props: { items: EditorAttachment[]; editable: boolean }) =>
  renderToStaticMarkup(createElement(AttachmentsEditor, { ...props, onChange: () => {} }));

test('empty + editable: shows the add control, not disabled', () => {
  const html = render({ items: [], editable: true });
  assert.match(html, /Add attachment/);
  assert.ok(!html.includes('disabled=""'), 'should not be disabled');
  assert.ok(!html.includes('of 6'), 'no counter with no images');
});

test('editable with images: shows the count and a remove control per image', () => {
  const html = render({ items: items(2), editable: true });
  assert.match(html, /2 of 6/);
  assert.equal((html.match(/Remove attachment/g) ?? []).length, 2);
  assert.equal((html.match(/<img/g) ?? []).length, 2);
});

test('at six: the control is disabled and reads 6 of 6', () => {
  const html = render({ items: items(6), editable: true });
  assert.match(html, /6 of 6/);
  assert.ok(html.includes('disabled=""'), 'should be disabled at the cap');
});

test('read-only (locked/sent): no add control, no remove controls, images still shown', () => {
  const html = render({ items: items(2), editable: false });
  assert.ok(!html.includes('Add attachment'), 'no add control when read-only');
  assert.ok(!html.includes('Remove attachment'), 'no remove control when read-only');
  assert.equal((html.match(/<img/g) ?? []).length, 2);
});
