// ═══ The nav arrows belong to every card ═══
// They used to be part of the expense card's world: on a laptop a deposit,
// STRIPE, pending or removed card had no way forward. The arrows are the
// sheet's own row now, so this test walks every card type through it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import StackNav from './StackNav';
import type { StackCardKind } from '../../lib/bank-stack';

const KINDS: StackCardKind[] = ['expense', 'deposit', 'stripe', 'pending', 'removed'];

const nav = (kind: StackCardKind, extra: { pending?: number; pos?: number; filter?: 'review' | 'ignored' } = {}) =>
  renderToStaticMarkup(createElement(StackNav, {
    kind,
    pending: extra.pending ?? 3,
    pos: extra.pos ?? 1,
    filter: extra.filter ?? 'review',
    onStep: () => {},
  }));

test('both arrows render for every card type, not only expenses', () => {
  for (const kind of KINDS) {
    const html = nav(kind);
    assert.equal(html.includes('aria-label="Previous item"'), true, `${kind}: no back arrow`);
    assert.equal(html.includes('aria-label="Next item"'), true, `${kind}: no forward arrow`);
    assert.equal(html.includes(`data-stack-nav="${kind}"`), true, `${kind}: the row reports the card it sits under`);
  }
});

test('the arrows are inert when there is nowhere to go', () => {
  assert.equal((nav('deposit', { pending: 0 }).match(/<button[^>]*\bdisabled=""/g) ?? []).length, 2, 'no items: both stop');
  assert.equal((nav('deposit', { pos: 0 }).match(/<button[^>]*\bdisabled=""/g) ?? []).length, 1, 'first card: only back stops');
  assert.equal((nav('stripe', { pos: 2, pending: 3 }).match(/<button[^>]*\bdisabled=""/g) ?? []).length, 1, 'last card: only forward stops');
});
