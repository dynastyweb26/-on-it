// The resolved per-slide timings in RECAP-SPEC §4 are the contract: the
// engine (ported from the prototype) must reproduce every heroEnd / total.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RECAP_CONFIG } from './config';
import { easeFn, refBeat, resolveBeats, resolveCues, slideCounts, slideTiming } from './timing';
import { fixturePayload } from './fixtures';
import { recapSequence, type RecapSlide } from './payload';

function timing(key: RecapSlide, counts: Record<string, number> = {}) {
  const cfg = RECAP_CONFIG.slides[key];
  const B = resolveBeats(cfg.beats, counts);
  const heroEnd = refBeat(cfg.heroEnd, (k) => B[k]);
  return { B, heroEnd, total: heroEnd + cfg.hold };
}

const SPEC: [RecapSlide, Record<string, number>, number, number][] = [
  ['opener', {}, 2100, 4500],
  ['moneyIn', { chips: 3, pour: 3, segs: 3, pct: 3 }, 3250, 6050],
  ['moneyInZero', { rows: 3, total: 1 }, 3380, 5980],
  ['moneyOut', { receipts: 3, trips: 3 }, 3700, 6500],
  ['kept', {}, 3000, 5600],
  ['keptInvest', { outBars: 3 }, 3100, 5700],
  ['glance', { bars: 4, vals: 4 }, 3000, 5600],
  ['owed', { cards: 3, edges: 0, more: 0 }, 2350, 5350],
  ['caughtUp', { cards: 3, stamp: 3, edges: 1, ripple: 1, more: 1, square: 1, band: 1, mark: 1, glint: 1 }, 2930, 5330],
  ['quiet', {}, 850, 3850],
];

for (const [key, counts, heroEnd, total] of SPEC) {
  test(`§4 ${key}: heroEnd ${heroEnd}, total ${total}`, () => {
    const t = timing(key, counts);
    assert.equal(t.heroEnd, heroEnd);
    assert.equal(t.total, total);
  });
}

test('opener beats match the §4 table', () => {
  const { B } = timing('opener');
  const got = Object.fromEntries(Object.entries(B).map(([k, b]) => [k, [b.start, b.end]]));
  assert.deepEqual(got, {
    line: [200, 1400], lift: [766, 1466], fill: [1200, 2100], haze: [1400, 2300],
    label: [1066, 1566], title: [1216, 1866], range: [1466, 1966], aff: [1766, 2566],
  });
});

test("opener lift = the line head passing 85 % ('out' reaches .85 at ~47.2 % of 1200 ms)", () => {
  const out = easeFn('out');
  assert.ok(Math.abs(out(566 / 1200) - 0.85) < 0.005, String(out(566 / 1200)));
});

test('caughtUp beats (4 paid) match the §4 table', () => {
  const { B } = timing('caughtUp', { cards: 3, stamp: 3, edges: 1, ripple: 1, more: 1, square: 1, band: 1, mark: 1, glint: 1 });
  assert.deepEqual([B.stamp.start, B.stamp.end, B.ripple.start, B.band.start, B.band.end, B.cta.start], [560, 1390, 1490, 2090, 2430, 2980]);
});

test('cues: opener sweep at 200, chime at 1466; caughtUp stamps each 330 ms', () => {
  const o = timing('opener');
  assert.deepEqual(resolveCues(RECAP_CONFIG.slides.opener.cues, o.B, false).map((c) => [c.t, c.sound]), [[200, 'sweep'], [1466, 'chime']]);
  const c = timing('caughtUp', { cards: 3, stamp: 3, edges: 1, ripple: 1, more: 1, square: 1, band: 1, mark: 1, glint: 1 });
  const stamps = resolveCues(RECAP_CONFIG.slides.caughtUp.cues, c.B, false).filter((x) => x.sound === 'stamp').map((x) => x.t);
  assert.deepEqual(stamps, [560, 890, 1220]);
});

test('count-up ticks: one per k/N crossing (moneyIn count: 14), bunched early; none under Reduce Motion', () => {
  const B = timing('moneyIn', { chips: 3, pour: 3, segs: 3, pct: 3 }).B;
  const cues = resolveCues(RECAP_CONFIG.slides.moneyIn.cues, B, false);
  const ticks = cues.filter((c) => c.sound === 'tick').map((c) => c.t);
  assert.equal(ticks.length, 14);
  assert.ok(ticks[1] - ticks[0] < ticks[13] - ticks[12], 'gaps widen as the count slows');
  assert.equal(resolveCues(RECAP_CONFIG.slides.moneyIn.cues, B, true).filter((c) => c.sound === 'tick' || c.sound === 'none').length, 0);
  assert.deepEqual(cues.filter((c) => c.sound === 'drop').map((c) => c.t), [950, 1210, 1470]);
});

test('zero-count beats are zero-length at their start', () => {
  const { B } = timing('owed', { cards: 3, edges: 0, more: 0 });
  assert.deepEqual([B.edges.start, B.edges.end, B.more.start, B.more.end], [1700, 1700, 1750, 1750]);
});

test('slideCounts from the payload: "the rest" comes from count, not the ≤ 3 stored', () => {
  const p = fixturePayload('caughtUp', 7);
  assert.equal(p.paid.invoices.length, 3);
  assert.deepEqual(slideCounts('caughtUp', p), { cards: 3, stamp: 3, edges: 4, ripple: 4, more: 1, square: 1, band: 1, mark: 1, glint: 1 });
  const o = fixturePayload('normalWeek', 20);
  assert.deepEqual(slideCounts('owed', o), { cards: 3, edges: 6, more: 1 });
});

test('every scenario sequence resolves to finite timings with heroEnd < duration', () => {
  for (const id of ['normalWeek', 'quietWeek', 'investmentWeek', 'caughtUp', 'nothing', 'busyMonth', 'quietMonth', 'spikyMonth'] as const) {
    const p = fixturePayload(id);
    for (const key of recapSequence(p)) {
      const t = slideTiming(key, p, false);
      assert.ok(Number.isFinite(t.duration) && t.heroEnd > 0 && t.heroEnd < t.duration, `${id}/${key}`);
    }
  }
});
