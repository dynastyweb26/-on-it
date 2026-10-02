// The columns + ribbon opener (RECAP-SPEC §5, decision 6) for every opener
// checkpoint case.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, CEILING, MAXH, STUB_H, buildColumns, columnsAmp, payloadColumns } from './columns';
import { fixturePayload, onePaymentWeek, scenarioPayload } from './fixtures';

test('one column per day: 7 weekly (prototype 30 px), one per day monthly, inside x 28 → 365', () => {
  const w = buildColumns(fixturePayload('normalWeek').daily, 1600).cols;
  assert.equal(w.length, 7);
  assert.equal(w[0].w, 30);
  const m = buildColumns(fixturePayload('busyMonth').daily, 9000).cols;
  assert.equal(m.length, 30);
  assert.ok(Math.abs(m[0].x - 28) < 1e-9 && Math.abs(m[29].x + m[29].w - 365) < 1e-6);
  assert.ok(m.every((c, i) => i === 0 || c.x > m[i - 1].x + m[i - 1].w), 'gaps between columns');
});

test('zero days are stubs, never invisible; real days are ≥ 14 px, taller than any stub', () => {
  const { cols } = buildColumns([0, 450, 0, 800, 5, 0, 200], 1600);
  for (const c of cols) assert.ok(c.h > 0);
  assert.deepEqual(cols.filter((c) => c.zero).map((c) => c.h), [STUB_H, STUB_H, STUB_H]);
  assert.ok(cols.filter((c) => !c.zero).every((c) => c.h >= 14));
});

test('height scaled against the previous period: amp = 0.4 + 0.6 × min(1, avg / ref); none → 0.75', () => {
  assert.equal(columnsAmp([100, 100], null), 0.75);
  assert.equal(columnsAmp([100, 100], 400), 0.4 + 0.6 * 0.5);
  assert.equal(columnsAmp([100, 100], 100), 1);
  const tallest = (id: Parameters<typeof fixturePayload>[0]) => Math.max(...payloadColumns(fixturePayload(id)).cols.map((c) => c.h));
  assert.equal(tallest('busyMonth'), MAXH);
  assert.ok(tallest('quietMonth') < 0.6 * MAXH, `quiet month tallest ${tallest('quietMonth')}`);
});

test('$0 week: every column a stub, the ribbon low and flat', () => {
  const c = payloadColumns(fixturePayload('quietWeek'));
  assert.ok(c.cols.every((x) => x.zero && x.h === STUB_H));
  const ys = [0, 0.25, 0.5, 0.75, 1].map((f) => c.pointAt(f).y);
  assert.ok(Math.max(...ys) - Math.min(...ys) < 0.5);
});

test('one-payment week: one tall column, six stubs', () => {
  const c = payloadColumns(scenarioPayload(onePaymentWeek));
  assert.equal(c.cols.filter((x) => !x.zero).length, 1);
  assert.equal(c.cols.filter((x) => x.zero).length, 6);
});

test('spiky month: three big paydays stand out, two small days stay small, every other day a stub', () => {
  const c = payloadColumns(fixturePayload('spikyMonth'));   // days 5:2400 11:150 18:3100 26:180 28:1900
  assert.equal(c.cols.filter((x) => !x.zero).length, 5);
  assert.equal(c.cols.filter((x) => x.h > 0.5 * MAXH).length, 3);
  assert.equal(c.cols.filter((x) => !x.zero && x.h < 20).length, 2);
});

test('nothing reaches above CEILING (the SE fit reference), at full height', () => {
  const c = payloadColumns(fixturePayload('busyMonth'));
  for (const f of [0, 0.2, 0.4, 0.6, 0.8, 1]) assert.ok(c.pointAt(f).y > CEILING, `ribbon at ${f}`);
  assert.ok(c.top >= BASE - MAXH);
});

test('screen mapping: x × kx, y → oy + y × ky; hand-off point (85 %) is on screen', () => {
  const p = fixturePayload('normalWeek');
  const a = payloadColumns(p), b = payloadColumns(p, 1, 0.5, 426);
  assert.equal(b.cols[3].x, a.cols[3].x);
  assert.equal(b.base, 426 + BASE * 0.5);
  assert.equal(b.cols[3].h, a.cols[3].h * 0.5);
  const h = a.pointAt(0.85);
  assert.ok(h.x > 250 && h.x < 393 && h.y < BASE && h.y > CEILING, JSON.stringify(h));
});

test('payload stores previous { income, expenses }', () => {
  assert.deepEqual(fixturePayload('quietMonth').previous, { income: 8000, expenses: 7000 });
  assert.equal(fixturePayload('nothing').previous, null);
});
