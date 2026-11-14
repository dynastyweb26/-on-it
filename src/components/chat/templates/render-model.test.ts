import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTemplate, THREAD_TEMPLATE_IDS } from './render-model';
import { TEMPLATE_FIXTURES } from '@/lib/templates/fixtures';

test('every wired id resolves from its own fixture', () => {
  for (const id of THREAD_TEMPLATE_IDS) {
    const r = resolveTemplate({ id, props: TEMPLATE_FIXTURES[id] });
    assert.equal(r?.id, id, id);
  }
});

test('an unknown id, a built-but-unwired id, or no card resolves to null', () => {
  assert.equal(resolveTemplate({ id: 'made.up', props: {} }), null);
  assert.equal(resolveTemplate({ id: 'draft.message', props: TEMPLATE_FIXTURES['draft.message'] }), null);
  assert.equal(resolveTemplate(null), null);
  assert.equal(resolveTemplate(undefined), null);
});

test('props that fail the schema resolve to null, never a half card', () => {
  const { title: _title, ...noTitle } = TEMPLATE_FIXTURES['list.ranked'];
  assert.equal(resolveTemplate({ id: 'list.ranked', props: noTitle }), null);
  assert.equal(resolveTemplate({ id: 'nav.link', props: { items: [] } }), null);
  assert.equal(resolveTemplate({ id: 'stat.tiles', props: 'nope' }), null);
});
