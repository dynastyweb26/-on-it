// The owner estimate tile: the photo thumbnail is the viewer trigger in every
// state (draft, sent, approved), while `editable` gates only the remove control
// and the caption input. Read-only must never mean unreadable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AttachmentTile, { type AttachmentTileProps } from './AttachmentTile';

const base: AttachmentTileProps = {
  index: 1,
  isImage: true,
  sizeBytes: 240_000,
  previewUrl: 'https://signed.test/photo.jpg',
  caption: 'Front door',
  editable: true,
  deleting: false,
  captionDraft: '',
  onOpen: () => {},
  onRemove: () => {},
  onCaptionChange: () => {},
};

const render = (props: Partial<AttachmentTileProps> = {}) =>
  renderToStaticMarkup(createElement(AttachmentTile, { ...base, ...props }));

const buttonCount = (html: string) => (html.match(/<button/g) ?? []).length;

test('editable: the photo is a button that opens the viewer, plus remove + caption', () => {
  const html = render();
  assert.match(html, /aria-label="Open photo: Front door"/);
  assert.equal(buttonCount(html), 2, 'viewer trigger + remove');
  assert.match(html, /Remove Front door/);
  assert.match(html, /<input/);
});

test('locked (approved): the photo still opens; no remove, no caption input', () => {
  const html = render({ editable: false });
  assert.match(html, /aria-label="Open photo: Front door"/);
  assert.equal(buttonCount(html), 1, 'viewer trigger only');
  assert.ok(!html.includes('Remove Front door'), 'no remove control when read-only');
  assert.ok(!html.includes('<input'), 'no caption input when read-only');
  assert.match(html, /Front door<\/p>/, 'caption still shown as text');
});

test('the remove control is a later sibling, so it wins the hit test', () => {
  const html = render();
  assert.ok(
    html.indexOf('Remove Front door') > html.indexOf('aria-label="Open photo'),
    'remove button must be rendered after the tile button',
  );
});

test('a photo whose signed URL failed to mint is not a trigger', () => {
  const html = render({ previewUrl: null });
  assert.equal(buttonCount(html), 1, 'remove only — nothing to open');
  assert.ok(!html.includes('Open photo'), 'no viewer target without a URL');
});
