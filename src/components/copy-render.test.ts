// Render guard: whatever the stored kind is ('quote' in the database), nothing a
// person can see or hear (text, aria-label, title, placeholder, alt) may say
// "quote". Add a component here whenever it prints a document noun.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TemplateCard from './template/TemplateCard';
import DeleteConfirmModal from './DeleteConfirmModal';
import { FORBIDDEN } from '../lib/ci/copy-scan';

/** Visible text plus the attributes a screen reader or tooltip exposes. */
function visibleCopy(html: string): string[] {
  const attrs = [...html.matchAll(/\b(?:aria-label|title|placeholder|alt)="([^"]*)"/g)].map((m) => m[1]);
  const text = html.replace(/<[^>]*>/g, '\n').split('\n').map((s) => s.trim()).filter(Boolean);
  return [...attrs, ...text];
}

const leaks = (html: string): string[] => visibleCopy(html).filter((s) => FORBIDDEN.test(s));

const noop = () => {};
const card = (kind: 'quote' | 'invoice') =>
  renderToStaticMarkup(createElement(TemplateCard, {
    kind, onKindChange: noop, onClose: noop, uid: 'u1', restored: null, onDraft: noop,
    sendState: 'disabled', onSend: noop, attachments: [], onAttachments: noop,
  }));

test('estimate template card never says "quote" (text or aria-label)', () => {
  const html = card('quote');
  assert.deepEqual(leaks(html), []);
  assert.match(html, /New estimate/, 'the header chip names it an estimate');
});

test('invoice template card offers "Make it an estimate", never "quote"', () => {
  const html = card('invoice');
  assert.deepEqual(leaks(html), []);
  assert.match(html, /Make it an estimate/);
});

test('delete dialog for a stored quote says estimate', () => {
  const html = renderToStaticMarkup(createElement(DeleteConfirmModal, {
    isOpen: true, onClose: noop, onConfirm: noop, title: 'Test', recordType: 'quote', status: 'draft',
  }));
  assert.deepEqual(leaks(html), []);
});
