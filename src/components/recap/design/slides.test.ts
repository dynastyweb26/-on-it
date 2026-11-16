// Every redesign slide, rendered from every redesign fixture (the five cases the
// slides must survive): the numbers on screen are the payload's own, and nothing
// prints NaN, undefined or an object. Old payloads (no collected / invoicesSent /
// estimatesApproved / topClient.pct / peakDay) must still play.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { redesignPayload, REDESIGN_FIXTURES, type RedesignFixtureId } from '@/lib/recap/fixtures';
import { redesignSequence, type RecapPayload, type RedesignSlide } from '@/lib/recap/payload';
import { createClock } from '@/components/recap/clock';
import { money } from '@/components/recap/copy';
import { designTiming } from '@/components/recap/design/timing';
import { DESIGN_SLIDES } from '@/components/recap/design/slides';

const IDS = Object.keys(REDESIGN_FIXTURES) as RedesignFixtureId[];

export function html(slide: RedesignSlide, payload: RecapPayload, userId = 'owner-1') {
  const Slide = DESIGN_SLIDES[slide];
  return renderToStaticMarkup(createElement(Slide, {
    payload, timing: designTiming(), clock: createClock(), reduced: true, index: 0, count: 9, opens: 1, userId, onAction: () => {},
  }));
}
const text = (h: string) => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
/** An old payload: nothing the redesign added. */
const old = (p: RecapPayload): RecapPayload => {
  const { collected: _c, invoicesSent: _i, estimatesApproved: _e, peakDay: _k, ...rest } = p;
  return { ...rest, topClient: p.topClient ? { name: p.topClient.name, amount: p.topClient.amount } : null } as RecapPayload;
};

for (const id of IDS) {
  test(`${id}: every slide in its sequence renders clean, new payload and old`, () => {
    const p = redesignPayload(id);
    for (const payload of [p, old(p)]) {
      for (const k of redesignSequence(payload, { plan: 'free' })) {
        if (k === 'quiet' || k === 'glance') continue;
        const t = text(html(k, payload));
        assert.doesNotMatch(t, /NaN|undefined|\[object|null/, `${id}/${k}`);
      }
    }
  });
}

test('opener: Collected is collected.total, Kept is net, Spent is spend.total', () => {
  for (const id of IDS) {
    const p = redesignPayload(id);
    const t = text(html('opener', p));
    assert.ok(t.includes(money(p.collected.total)), `${id} collected`);
    assert.ok(t.includes(money(p.net)), `${id} kept`);
    assert.ok(t.includes(money(p.spend.total)), `${id} spent`);
    assert.ok(t.includes('Invoices sent'), `${id} sent`);
  }
});

test('opener: an old payload falls back to income.total and drops what it never had', () => {
  const p = old(redesignPayload('normalWeek'));
  const t = text(html('opener', p));
  assert.ok(t.includes(money(p.income.total)));
  assert.ok(!t.includes('Invoices sent'));
});
