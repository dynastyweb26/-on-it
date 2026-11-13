// The design files are the contract. These tests prove the server half matches
// them: every id has a schema, every state in every file parses, the board's
// sample data fits, and the caps the files declare are enforced rather than
// quietly ignored.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATE_IDS } from '@/lib/tools/templates';
import {
  TEMPLATE_PROPS,
  TEMPLATE_PROP_IDS,
  TEMPLATE_STATES,
  parseTemplateProps,
} from './props';
import type {
  BreakdownCallbacks,
  ConfirmBatchCallbacks,
  NavLinkCallbacks,
  RankedListCallbacks,
  StatTilesCallbacks,
  TrendChartCallbacks,
} from './callbacks';
import {
  BREAKDOWN_FIXTURE,
  CANT_DO_FIXTURE,
  CONFIRM_BATCH_FIXTURE,
  CONFIRM_BATCH_PARTIAL_FIXTURE,
  CONFIRM_BATCH_STATE_FIXTURES,
  DRAFT_MESSAGE_FIXTURE,
  FEEDBACK_CHECKIN_FIXTURE,
  FEEDBACK_THUMBS_FIXTURE,
  NAV_LINK_FIXTURE,
  RANKED_LIST_FIXTURE,
  STAT_TILES_FIXTURE,
  TEMPLATE_FIXTURES,
  TREND_CHART_FIXTURE,
} from './fixtures';

test('all ten ids, and only those ids, have a props schema', () => {
  assert.deepEqual([...TEMPLATE_PROP_IDS].sort(), [...TEMPLATE_IDS].sort());
  assert.equal(Object.keys(TEMPLATE_PROPS).length, 10);
});

test('every board fixture fits its own schema', () => {
  for (const id of TEMPLATE_IDS) {
    const parsed = parseTemplateProps(id, TEMPLATE_FIXTURES[id]);
    assert.equal(parsed.success, true, `${id}: ${parsed.success ? '' : parsed.error.message}`);
  }
});

test('every state in every design file parses, and nothing else does', () => {
  for (const id of TEMPLATE_IDS) {
    for (const state of TEMPLATE_STATES[id]) {
      const parsed = parseTemplateProps(id, { ...TEMPLATE_FIXTURES[id], state });
      assert.equal(parsed.success, true, `${id} state ${state}`);
    }
    const bogus = parseTemplateProps(id, { ...TEMPLATE_FIXTURES[id], state: 'exploded' });
    assert.equal(bogus.success, false, `${id} accepted an invented state`);
  }
});

test('the board sample values are copied, not invented', () => {
  assert.equal(RANKED_LIST_FIXTURE.rows[0].amount, '$8,100.00');
  assert.equal(RANKED_LIST_FIXTURE.total.amount, '$77,140.40');
  assert.equal(RANKED_LIST_FIXTURE.totalCount, 18);
  assert.deepEqual(
    STAT_TILES_FIXTURE.tiles.map((t) => t.label),
    ['Collected', 'Spent', 'Net'],
  );
  assert.equal(TREND_CHART_FIXTURE.points[1].inc, 3150);
  assert.equal(TREND_CHART_FIXTURE.points[4].out, 3597.61);
  assert.equal(BREAKDOWN_FIXTURE.total, '$5,200.80');
  assert.equal(CONFIRM_BATCH_FIXTURE.actions.length, 3);
  assert.deepEqual(
    CONFIRM_BATCH_FIXTURE.actions.map((action) => [action.id, action.kind, action.status]),
    [
      ['pay-ruth', 'record', 'pending'],
      ['remind-tony', 'draft', 'pending'],
      ['expense-home-depot', 'record', 'pending'],
    ],
  );
  assert.equal(NAV_LINK_FIXTURE.items.length, 1);
  assert.equal(NAV_LINK_FIXTURE.emptyTitle, 'INV-0069 is gone');
  assert.equal(FEEDBACK_THUMBS_FIXTURE.state, 'idle');
  assert.equal(FEEDBACK_CHECKIN_FIXTURE.state, 'open');
  assert.match(DRAFT_MESSAGE_FIXTURE.body, /\$8,100\.00/);
  assert.equal(CANT_DO_FIXTURE.alternatives?.length, 2);
});

test('nav.link needs an emptyTitle only when there is nothing to link to', () => {
  const withoutTitle = { ...NAV_LINK_FIXTURE, emptyTitle: undefined };

  const filled = parseTemplateProps('nav.link', { ...withoutTitle, state: 'filled' });
  assert.equal(filled.success, true, 'a filled link does not need an empty headline');

  const empty = parseTemplateProps('nav.link', { ...withoutTitle, state: 'empty' });
  assert.equal(empty.success, false, 'an empty link needs its headline');

  const titled = parseTemplateProps('nav.link', { ...NAV_LINK_FIXTURE, state: 'empty' });
  assert.equal(titled.success, true, 'an empty link with its headline parses');
});

test('the three round-1 error cards report a retry', () => {
  const retry = () => {};
  const ranked: RankedListCallbacks = { onRetry: retry };
  const tiles: StatTilesCallbacks = { onRetry: retry };
  const link: NavLinkCallbacks = { onRetry: retry };

  assert.deepEqual([ranked.onRetry, tiles.onRetry, link.onRetry], [retry, retry, retry]);
});

test('the round-2 chart errors retry and the batch cancels', () => {
  const retry = () => {};
  const cancel = () => {};
  const trend: TrendChartCallbacks = { onRetry: retry };
  const breakdown: BreakdownCallbacks = { onRetry: retry };
  const batch: ConfirmBatchCallbacks = { onCancel: cancel };

  assert.deepEqual([trend.onRetry, breakdown.onRetry], [retry, retry]);
  assert.equal(batch.onCancel, cancel);
});

test('confirm.batch carries server row statuses, including the one that failed', () => {
  for (const state of ['pending', 'confirming', 'done', 'partial', 'loading'] as const) {
    const parsed = parseTemplateProps('confirm.batch', CONFIRM_BATCH_STATE_FIXTURES[state]);
    assert.equal(parsed.success, true, `confirm.batch ${state}`);
  }

  assert.deepEqual(
    CONFIRM_BATCH_PARTIAL_FIXTURE.actions.map((action) => [action.kind, action.status]),
    [['record', 'saved'], ['draft', 'saved'], ['record', 'failed']],
  );
});

test('the caps the design declares are enforced', () => {
  const fourTiles = {
    ...STAT_TILES_FIXTURE,
    tiles: [...STAT_TILES_FIXTURE.tiles, { label: 'Extra', value: '+$1', tone: 'in', period: '' }],
  };
  assert.equal(parseTemplateProps('stat.tiles', fourTiles).success, false);

  const fourItems = {
    ...NAV_LINK_FIXTURE,
    items: Array.from({ length: 4 }, () => NAV_LINK_FIXTURE.items[0]),
  };
  assert.equal(parseTemplateProps('nav.link', fourItems).success, false);

  const oneAction = { ...CONFIRM_BATCH_FIXTURE, actions: [CONFIRM_BATCH_FIXTURE.actions[0]] };
  assert.equal(parseTemplateProps('confirm.batch', oneAction).success, false);

  const fiveActions = {
    ...CONFIRM_BATCH_FIXTURE,
    actions: Array.from({ length: 5 }, () => CONFIRM_BATCH_FIXTURE.actions[0]),
  };
  assert.equal(parseTemplateProps('confirm.batch', fiveActions).success, false);

  const thirteenPoints = {
    ...TREND_CHART_FIXTURE,
    points: Array.from({ length: 13 }, () => TREND_CHART_FIXTURE.points[0]),
  };
  assert.equal(parseTemplateProps('chart.trend', thirteenPoints).success, false);

  const threeAlts = { ...CANT_DO_FIXTURE, alternatives: ['a', 'b', 'c'] };
  assert.equal(parseTemplateProps('cant.do', threeAlts).success, false);
});

test('money that is not a finished string is refused', () => {
  const numeric = {
    ...BREAKDOWN_FIXTURE,
    rows: [{ ...BREAKDOWN_FIXTURE.rows[0], amount: 2140 }],
  };
  assert.equal(parseTemplateProps('chart.breakdown', numeric).success, false);

  const badShare = {
    ...BREAKDOWN_FIXTURE,
    rows: [{ ...BREAKDOWN_FIXTURE.rows[0], share: 101 }],
  };
  assert.equal(parseTemplateProps('chart.breakdown', badShare).success, false);

  const missingRows = { ...RANKED_LIST_FIXTURE, rows: undefined };
  assert.equal(parseTemplateProps('list.ranked', missingRows).success, false);
});
