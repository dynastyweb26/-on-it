// RULES.md §2/§5: 2-12 points, one point falls back to stat.tiles, zero is the
// empty state, and the readout is the design's own money format.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TREND_CHART_FIXTURE } from './fixtures';
import {
  TREND_MAX_POINTS,
  fmtMoney,
  overSpentPeriods,
  selectedPoint,
  trendChartProps,
  trendReadout,
  trendView,
} from './trend';
import { parseTemplateProps } from './props';

const points = TREND_CHART_FIXTURE.points;

test('two to twelve points render the chart', () => {
  const view = trendView(points);
  assert.equal(view.kind, 'chart');
  if (view.kind !== 'chart') return;
  assert.equal(view.template, 'chart.trend');
  assert.equal(view.points.length, 6);
  assert.equal(TREND_MAX_POINTS, 12);
});

test('more than twelve points keeps the newest twelve', () => {
  const many = Array.from({ length: 14 }, (_, i) => ({ label: `M${i + 1}`, inc: i, out: 0 }));
  const view = trendView(many);
  assert.equal(view.kind, 'chart');
  if (view.kind !== 'chart') return;
  assert.equal(view.points.length, 12);
  assert.equal(view.points[0].label, 'M3');
  assert.equal(view.points[11].label, 'M14');
});

test('one point falls back to stat.tiles with Collected and Spent', () => {
  const view = trendView([{ label: 'Nov', full: 'Nov 1–11', inc: 4210, out: 3598 }]);
  assert.equal(view.kind, 'fallback');
  if (view.kind !== 'fallback') return;
  assert.equal(view.resolved, 'stat.tiles');
  assert.deepEqual(view.tiles, [
    { label: 'Collected', value: '+$4,210.00', tone: 'in', period: 'Nov 1–11' },
    { label: 'Spent', value: '−$3,598.00', tone: 'out', period: 'Nov 1–11' },
  ]);
  const parsed = parseTemplateProps('stat.tiles', {
    state: 'filled',
    eyebrow: 'This month',
    title: '',
    tiles: view.tiles,
  });
  assert.equal(parsed.success, true);
});

test('zero points is the empty state, not an empty chart', () => {
  assert.deepEqual(trendView([]), {
    kind: 'empty',
    template: 'chart.trend',
    points: [],
    state: 'empty',
  });
  assert.equal(trendChartProps({ eyebrow: 'In vs out', title: '' }, []).state, 'empty');
});

test('the periods that spent more than they brought in are named', () => {
  const over = overSpentPeriods(points);
  assert.deepEqual(over.labels, ['Aug 2026']);
  assert.equal(over.text, 'Spent more than you brought in during Aug 2026.');

  const two = overSpentPeriods([
    { label: 'Jun', inc: 1, out: 2 },
    { label: 'Jul', inc: 1, out: 3 },
    { label: 'Aug', inc: 5, out: 1 },
  ]);
  assert.deepEqual(two.labels, ['Jun', 'Jul']);
  assert.equal(two.text, 'Spent more than you brought in during 2 periods.');

  assert.deepEqual(overSpentPeriods([{ label: 'Jun', inc: 5, out: 1 }]), { labels: [], text: '' });
});

test('the readout formats In, Out and Kept the way the design does', () => {
  assert.equal(fmtMoney(4210.5, true), '+$4,210.50');
  assert.equal(fmtMoney(-240, true), '−$240.00');
  assert.equal(fmtMoney(3597.61), '$3,597.61');

  const readout = trendReadout({ label: 'Nov 2026', full: 'Nov 1–11', inc: 2860, out: 1420 });
  assert.deepEqual(readout, {
    full: 'Nov 1–11',
    inc: '+$2,860.00',
    out: '−$1,420.00',
    kept: '+$1,440.00',
    keptNegative: false,
  });

  const negative = trendReadout({ label: 'Aug', inc: 1980, out: 2310 });
  assert.equal(negative.kept, '−$330.00');
  assert.equal(negative.keptNegative, true);
  assert.equal(negative.full, 'Aug');
});

test('the selected point clamps to the series, defaulting to the newest', () => {
  assert.equal(selectedPoint(points, null)?.label, 'Nov 2026');
  assert.equal(selectedPoint(points, 0)?.label, 'Jun 2026');
  assert.equal(selectedPoint(points, 99)?.label, 'Nov 2026');
  assert.equal(selectedPoint([], 0), null);
});
