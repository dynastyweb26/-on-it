// ═══ Revealing a section that appeared below the fold ═══
// The deposit card's chips and pickers render after a choice, often past the
// card body's visible edge. The reveal has to move that scroller only as far as
// the section needs, and it has to drop the glide when Reduce Motion is on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { revealSection } from './reveal';

type ScrollOptions = { block: string; behavior: string };

const target = () => {
  const calls: ScrollOptions[] = [];
  const el = {
    scrollIntoView: (options: ScrollOptions) => { calls.push(options); },
  } as unknown as Element;
  return { el, calls };
};

test('a revealed section asks for the nearest edge, gliding by default', () => {
  const { el, calls } = target();
  assert.equal(revealSection(el, false), true, 'it scrolled');
  assert.deepEqual(calls, [{ block: 'nearest', behavior: 'smooth' }]);
});

test('Reduce Motion jumps instead of gliding', () => {
  const { el, calls } = target();
  revealSection(el, true);
  assert.deepEqual(calls, [{ block: 'nearest', behavior: 'auto' }], 'behavior auto, not smooth');
});

test('a section that never rendered is not a scroll', () => {
  assert.equal(revealSection(null, false), false, 'no element, no scroll');
});
