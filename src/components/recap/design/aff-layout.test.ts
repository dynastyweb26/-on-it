// affLayout (RULES 13): line breaking, key vs plain sizes, step-down, no one-word
// lines. Widths are injected, so no browser is needed: the fake measure is
// roughly Montserrat's average advance (heavier for 800).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AFF_BOX, affLayout, parseMarked, type Measure } from './aff-layout';

export const fakeMeasure: Measure = (text, weight, px) => text.length * px * (weight === 800 ? 0.64 : 0.58);

const wordsOf = (l: ReturnType<typeof affLayout>) => l.lines.map((ln) => ln.segs.flatMap((g) => g.words.map((w) => w.w)));
const height = (l: ReturnType<typeof affLayout>) => l.lines.reduce((a, ln) => a + ln.lh, 0);

test('parse: brackets are removed, the first two key phrases are keyed, a third is plain', () => {
  const t = parseMarked('Keep [showing up]. The Lord will [bless] the [works] of your hands');
  assert.deepEqual(t.map((x) => x.t), ['Keep', 'showing', 'up.', 'The', 'Lord', 'will', 'bless', 'the', 'works', 'of', 'your', 'hands']);
  assert.deepEqual(t.map((x) => x.k), [-1, 0, 0, -1, -1, -1, 1, -1, -1, -1, -1, -1]);
  assert.ok(t.every((x) => !/[\[\]]/.test(x.t)));
});

test('start size follows the word count: 60 / 52 / 44 / 40 when the text fits at once', () => {
  const k = (n: number) => affLayout(Array.from({ length: n }, (_, i) => (i === 0 ? '[Go]' : 'ok')).join(' '), false, () => 1).K;
  assert.equal(k(4), 60);
  assert.equal(k(8), 52);
  assert.equal(k(12), 44);
  assert.equal(k(16), 40);
});

test('key words are 800 at K, plain words 600 at 0.72 K; line height follows the larger kind', () => {
  const L = affLayout('Keep [showing up]. The Lord will [bless] the works of your hands', false, fakeMeasure);
  assert.equal(L.P2, Math.round(L.K * 0.72));
  for (const ln of L.lines) {
    assert.equal(ln.lh, ln.key ? Math.round(L.K * 1.08) : Math.round(L.P2 * 1.26));
    assert.equal(ln.gap, ln.key ? L.K * 0.24 : L.P2 * 0.3);
    assert.equal(ln.key, ln.segs.some((g) => g.k >= 0));
  }
});

test('a short quote stays large; a long one steps down in 2 px steps until it fits the box', () => {
  const short = affLayout('Small steps [build empires].', false, fakeMeasure);
  const long = affLayout('Every invoice you send, every job you finish, is [proof you’re building] something that will [last].', false, fakeMeasure);
  assert.ok(short.K <= 60 && short.K > long.K, `short ${short.K} vs long ${long.K}`);
  assert.ok(long.K < 40 && long.K >= 22, `K=${long.K}`);
  assert.equal((40 - long.K) % 2, 0);
  for (const L of [short, long]) {
    assert.ok(height(L) <= AFF_BOX.app.H, `height ${height(L)}`);
    for (const ln of L.lines) assert.ok(ln.w <= AFF_BOX.app.W, `line ${ln.w}`);
  }
});

test('the share image uses the smaller box (300 x 320) and never a larger K', () => {
  const q = 'No [achievement] is too high if you’re meant to [reach it]';
  const app = affLayout(q, false, fakeMeasure), ex = affLayout(q, true, fakeMeasure);
  assert.equal(ex.W, 300);
  assert.equal(ex.H, 320);
  assert.ok(ex.K <= app.K);
  assert.ok(height(ex) <= 320);
  for (const ln of ex.lines) assert.ok(ln.w <= 300);
});

test('no line is a single word (when there is more than one), and no word is lost or reordered', () => {
  for (const q of [
    'Small steps [build empires].', 'If not you, [who]? If not now, [when]?', '[Labour] in a way that God can [bless your works]',
    'Even when it feels like nobody’s watching [keep working]', 'Keep a [steady pace], nobody’s rushing you',
    'What are [limits] to the [creator of the universe]?',
  ]) {
    for (const ex of [false, true]) {
      const L = affLayout(q, ex, fakeMeasure);
      for (const w of wordsOf(L)) assert.ok(w.length >= 2, `${q} → ${w.join(' ')}`);
      assert.equal(wordsOf(L).flat().join(' '), q.replace(/[\[\]]/g, ''));
    }
  }
  assert.deepEqual(wordsOf(affLayout('[Go]', false, fakeMeasure)), [['Go']], 'one word is allowed when it is all there is');
});

test('lines break at punctuation when the width allows', () => {
  const L = affLayout('Keep [showing up]. The Lord will [bless] the works of your hands', false, fakeMeasure);
  const lines = wordsOf(L);
  assert.ok(lines.length >= 2);
  assert.ok(lines.some((w) => w[w.length - 1] === 'up.'), lines.map((w) => w.join(' ')).join(' / '));
  for (const w of lines.slice(0, -1)) assert.ok(!/^(the|of|a|an|to|and|or|if)$/i.test(w[w.length - 1]), w.join(' '));
});

test('the brush: one segment, the first key phrase; every seg carries the same wipe delay; the divider follows the last word', () => {
  const q = 'Keep [showing up]. The Lord will [bless] the works of your hands';
  const L = affLayout(q, false, fakeMeasure);
  const segs = L.lines.flatMap((l) => l.segs);
  const under = segs.filter((g) => g.under);
  assert.equal(under.length, 1);
  assert.equal(under[0].k, 0);
  assert.deepEqual(under[0].words.map((w) => w.w), ['showing', 'up.']);
  assert.ok(segs.every((g) => g.ud === under[0].words[under[0].words.length - 1].d + 260));
  const n = L.plain.split(' ').length;
  assert.equal(L.divD, 550 + n * 85 + 250);
  const ds = segs.flatMap((g) => g.words.map((w) => w.d));
  assert.deepEqual(ds, ds.map((_, i) => 550 + i * 85), 'word-by-word, 85 ms apart from 550');
});
