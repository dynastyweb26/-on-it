// The template ids are a contract with the design files and the components.
// These tests pin the list exactly: a rename or an extra id has to fail here
// before it reaches a tool definition or a chat card.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TEMPLATE_IDS,
  TemplateIdSchema,
  isTemplateId,
  resolveTemplate,
} from './templates';

test('the registry knows exactly the ten ids RULES.md section 2 names', () => {
  assert.deepEqual(TEMPLATE_IDS, [
    'list.ranked',
    'stat.tiles',
    'chart.trend',
    'chart.breakdown',
    'draft.message',
    'confirm.batch',
    'cant.do',
    'nav.link',
    'feedback.thumbs',
    'feedback.checkin',
  ]);
  assert.equal(new Set(TEMPLATE_IDS).size, TEMPLATE_IDS.length);
});

test('every id is dotted snake_case, the shape the design files use', () => {
  for (const id of TEMPLATE_IDS) {
    assert.match(id, /^[a-z]+(\.[a-z]+)+$/, id);
    assert.equal(isTemplateId(id), true);
    assert.equal(TemplateIdSchema.safeParse(id).success, true);
  }
});

test('ids that are not in the catalog are refused', () => {
  for (const id of ['unpaid.legacy', 'payment_card', 'list', 'list.ranked.extra', 'List.Ranked', '']) {
    assert.equal(isTemplateId(id), false, id);
    assert.equal(TemplateIdSchema.safeParse(id).success, false, id);
  }
  assert.equal(isTemplateId(null), false);
});

test('a chart with one point renders the stat tiles template', () => {
  assert.equal(resolveTemplate('chart.trend', 1), 'stat.tiles');
  assert.equal(resolveTemplate('chart.trend', 0), 'chart.trend');
  assert.equal(resolveTemplate('chart.trend', 2), 'chart.trend');
  assert.equal(resolveTemplate('chart.trend'), 'chart.trend');
  assert.equal(resolveTemplate('chart.breakdown', 1), 'chart.breakdown');
  assert.equal(resolveTemplate('list.ranked', 1), 'list.ranked');
});
