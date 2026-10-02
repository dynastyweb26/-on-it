// The opener horizon must "look intentional" (RECAP-SPEC §5) for every
// checkpoint case: these pin the geometry the preview shows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, buildHorizon, horizonAmp, payloadHorizon, type Horizon } from './horizon';
import { fixturePayload, onePaymentWeek, scenarioPayload } from './fixtures';

/** Hills = local highs of the drawn curve on screen, ignoring ripples lower
 *  than 15 % of the tallest. */
function hills(h: Horizon, d: string = h.d) {
  const pts = d.slice(1).split(' L').map((s) => s.split(' ').map(Number)).map(([x, y]) => ({ x, y }));
  const height = (y: number) => BASE - y;
  const tall = height(Math.min(...pts.map((p) => p.y)));
  return pts.filter((p, i) => i > 0 && i < pts.length - 1 && p.x >= 0 && p.x <= 393
    && p.y <= pts[i - 1].y && p.y < pts[i + 1].y && height(p.y) >= 0.15 * tall);
}

test('vertices: ≈ 120 weekly (20 per segment), ≈ 230 monthly (8 per segment)', () => {
  assert.equal(buildHorizon([1, 2, 3, 4, 5, 6, 7], 100).vertices, 6 * 20 + 1);
  assert.equal(buildHorizon(Array(30).fill(1), 100).vertices, 29 * 8 + 1);
});

test('the curve bleeds past both edges (x −10 → 403) and never drops below BASE + 4', () => {
  const h = buildHorizon([0, 0, 0, 900, 0, 0, 0], 1600);
  assert.ok(h.d.startsWith('M-10.0 '));
  assert.ok(h.d.endsWith(' L403.0 ' + h.pointAt(1).y.toFixed(1)));
  const ys = h.d.slice(1).split(' L').map((s) => Number(s.split(' ')[1]));
  assert.ok(Math.max(...ys) <= BASE + 4);
});

test('a zero day dips to 6 % of the height, never flat on the floor', () => {
  const h = buildHorizon([0, 0, 0, 0, 0, 0, 1000], 7000);
  const ys = h.d.slice(1).split(' L').map((s) => Number(s.split(' ')[1]));
  const low = Math.max(...ys);
  assert.ok(BASE - low > 0.04 * (BASE - h.top), `lowest point ${low}`);
});

test('height: amp = 0.4 + 0.6 × min(1, avg / ref); no previous → 0.75', () => {
  assert.equal(horizonAmp([100, 100], null), 0.75);
  assert.equal(horizonAmp([100, 100], 0), 0.75);
  assert.equal(horizonAmp([100, 100], 400), 0.4 + 0.6 * 0.5);
  assert.equal(horizonAmp([100, 100], 100), 1);
});

test('quiet month draws a clearly lower horizon than a busy month', () => {
  const busy = payloadHorizon(fixturePayload('busyMonth'));
  const quiet = payloadHorizon(fixturePayload('quietMonth'));
  assert.equal(busy.amp, 1);
  assert.ok(quiet.amp < 0.6, `quiet amp ${quiet.amp}`);
  assert.ok(BASE - quiet.top < 0.6 * (BASE - busy.top));
});

test('spiky month: 4 separated hills, no needles', () => {
  const h = payloadHorizon(fixturePayload('spikyMonth'));
  const hs = hills(h);
  assert.equal(hs.length, 4, JSON.stringify(hs));
  for (let i = 1; i < hs.length; i++) assert.ok(hs[i].x - hs[i - 1].x > 40, 'hills are apart');
});

test('one-payment week: one soft hill, the rest low', () => {
  const p = scenarioPayload(onePaymentWeek);
  assert.equal(p.income.payments, 1);
  const h = payloadHorizon(p);
  assert.equal(hills(h).length, 1);
  assert.equal(h.second, null);
});

test('$0 week: a calm swell ≤ 6 px, 12 px above BASE, no hills, no second haze', () => {
  const h = payloadHorizon(fixturePayload('quietWeek'));
  assert.equal(h.zero, true);
  const ys = h.d.slice(1).split(' L').map((s) => Number(s.split(' ')[1]));
  assert.ok(Math.max(...ys) - Math.min(...ys) <= 6.01);
  assert.ok(Math.abs(Math.max(...ys) - (BASE - 12)) < 0.6);
  assert.equal(h.second, null);
});

test('second haze only over a hill ≥ 70 % of the peak and ≥ 90 px away', () => {
  const twin = buildHorizon([0, 1000, 0, 0, 0, 950, 0], 7000);
  assert.ok(twin.second && Math.abs(twin.second.x - twin.peak.x) >= 90);
  assert.equal(buildHorizon([0, 1000, 0, 0, 0, 300, 0], 7000).second, null);
});

test('pointAt(0.85) lies on the line (the rider → mark handoff point)', () => {
  const h = payloadHorizon(fixturePayload('normalWeek'));
  const p = h.pointAt(0.85);
  assert.ok(p.x > 250 && p.x < 403 && p.y < BASE + 5 && p.y > h.top - 5, JSON.stringify(p));
});

test('payload stores previous { income, expenses }', () => {
  assert.deepEqual(fixturePayload('quietMonth').previous, { income: 8000, expenses: 7000 });
  assert.equal(fixturePayload('nothing').previous, null);
});

test('screenHorizon: uniform map keeps the shape; a vertical squash keeps x and lowers the peak band', async () => {
  const { screenHorizon } = await import('./horizon');
  const h = payloadHorizon(fixturePayload('busyMonth'));
  const u = screenHorizon(h, 1, 1, 0, 852);
  assert.equal(u.d, h.d);
  const sq = screenHorizon(h, 1, 0.5, 426, 852);
  assert.equal(sq.peak.x, h.peak.x);
  assert.equal(sq.peak.y, 426 + h.peak.y * 0.5);
  const p = sq.pointAt(0.85);
  assert.ok(p.y > 426 && p.y < 852);
});
