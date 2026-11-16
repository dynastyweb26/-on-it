// All 16 real affirmations through the slide and the share image (RULES 13):
// no bracket on screen, every word there in order, nothing wider or taller than
// its box, no one-word line. Widths are the injected average (no browser here);
// the page measures with the real font, with the same algorithm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CEO_AFFIRMATIONS, CEO_AFFIRMATION_MARKS, pickAffirmation, stripMarks } from '@/lib/recap/ceo-affirmations';
import { redesignPayload } from '@/lib/recap/fixtures';
import { createClock } from '@/components/recap/clock';
import { designTiming } from '@/components/recap/design/timing';
import DesignAff from '@/components/recap/design/DesignAff';
import { AFF_BOX, affLayout } from '@/components/recap/design/aff-layout';
import { approxMeasure } from '@/components/recap/design/aff-measure';
import { pickMarkedAffirmation } from '@/components/recap/design/aff-line';

const render = (recapIndex: number) => renderToStaticMarkup(createElement(DesignAff, {
  payload: { ...redesignPayload('normalWeek'), recapIndex }, timing: designTiming(), clock: createClock(), reduced: true,
  index: 0, count: 9, opens: 1, userId: 'owner-1', onAction: () => {},
}));
const text = (h: string) => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

test('there are 16 real affirmations, each marked, with the marks matching the plain text', () => {
  assert.equal(CEO_AFFIRMATIONS.length, 16);
  assert.equal(CEO_AFFIRMATION_MARKS.length, 16);
});

for (let n = 0; n < 16; n++) {
  const marked = pickMarkedAffirmation('owner-1', n);
  const plain = pickAffirmation('owner-1', n);
  test(`affirmation ${n + 1}/16: "${plain.slice(0, 32)}…" renders clean, fits, no one-word line`, () => {
    const h = render(n);
    const t = text(h);
    assert.doesNotMatch(t, /[\[\]]/, 'no bracket visible');
    // every word, in order, in the slide and again in the share image (the second copy)
    const words = stripMarks(marked).split(' ');
    const inOrder = (s: string) => { let at = 0; for (const w of words) { at = s.indexOf(w, at); assert.ok(at >= 0, `${w} in order`); at += w.length; } };
    inOrder(t);
    inOrder(t.slice(t.indexOf(words[words.length - 1]) + 1));
    assert.ok(h.includes('data-a="wipe"'), 'brush under the first key phrase');
    assert.ok(h.includes('rotate(45deg)'), 'diamond divider');
    assert.ok(h.includes('min-height:32px'), '32px clear of Share');
    for (const ex of [false, true]) {
      const L = affLayout(marked, ex, approxMeasure);
      const box = ex ? AFF_BOX.share : AFF_BOX.app;
      assert.ok(L.lines.reduce((a, l) => a + l.lh, 0) <= box.H, `${ex ? 'share' : 'app'} height`);
      for (const l of L.lines) {
        assert.ok(l.w <= box.W, `${ex ? 'share' : 'app'} width ${l.w}`);
        assert.ok(l.segs.reduce((c, g) => c + g.words.length, 0) >= 2, `one-word line in "${plain}"`);
      }
      assert.equal(L.lines.flatMap((l) => l.segs.flatMap((g) => g.words.map((w) => w.w))).join(' '), stripMarks(marked));
    }
  });
}
