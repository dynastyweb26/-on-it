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
import { keptNote, money, moneyInNote } from '@/components/recap/copy';
import { designTiming } from '@/components/recap/design/timing';
import { payMark } from '@/lib/recap/paymarks';
import { pickAffirmation } from '@/lib/recap/ceo-affirmations';
import { isShareCancel, shareErrorMessage, shareRoute } from '@/components/recap/design/share-image';
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

test('money in: the big number is collected.total; the cards and chips are the payload\'s', () => {
  for (const id of IDS) {
    const p = redesignPayload(id);
    const t = text(html('in', p));
    assert.ok(t.includes(money(p.collected.total)), `${id} collected`);
    assert.ok(t.includes(money(p.collected.invoices)), `${id} invoices paid`);
    assert.ok(t.includes(money(p.collected.other)), `${id} other`);
    for (const m of p.paymentMethods) assert.ok(t.includes(money(m.amount)), `${id} ${m.method}`);
    assert.ok(t.includes(`${p.collected.payments} payment`), `${id} caption`);
    if (!p.paymentMethods.length) assert.ok(!t.includes('How it came in'));
  }
});

test('money in: an old payload shows income.total as money in', () => {
  const p = old(redesignPayload('normalWeek'));
  const t = text(html('in', p));
  assert.ok(t.includes(money(p.income.total)));
});

test('money out: spend.total, the category rows and the top store are the payload\'s; zero spend shows the designed card', () => {
  for (const id of IDS) {
    const p = redesignPayload(id);
    const t = text(html('out', p));
    assert.ok(t.includes(money(p.spend.total)), `${id} spent`);
    if (p.spend.total > 0) {
      for (const c of p.spend.categories.slice(0, 3)) assert.ok(t.includes(money(c.amount)), `${id} ${c.key}`);
      if (p.topVendor) assert.ok(t.includes(p.topVendor.name) && t.includes(money(p.topVendor.amount)), `${id} vendor`);
      assert.ok(!t.includes('Nothing spent'), id);
    } else {
      assert.ok(t.includes('Nothing spent this week.'), id);
      assert.ok(!t.includes('Most of it at'), id);
    }
  }
});

test('kept: net is the big number, money in and out are the payload\'s, the chip is the change', () => {
  for (const id of IDS) {
    const p = redesignPayload(id);
    const t = text(html('kept', p));
    assert.ok(t.includes(money(p.net)), `${id} net`);
    assert.ok(t.includes(money(p.collected.total)), `${id} in`);
    assert.ok(t.includes(money(p.spend.total)), `${id} out`);
    if (p.change) assert.match(t, /(Up|Down) \d+% from|About the same as/, id);
    else assert.doesNotMatch(t, /from last week/, id);
  }
});

test('kept: a loss week draws an empty ring and still plays (RULE 11)', () => {
  const p = { ...redesignPayload('normalWeek'), net: -120 };
  const h = html('kept', p);
  assert.ok(text(h).includes('−$120'));
  assert.ok(h.includes('stroke-dasharray:0.00 '), 'empty arc');
});

test('invoices: the three counts, the owed card and its line come from the payload', () => {
  for (const id of IDS) {
    const p = redesignPayload(id);
    const t = text(html('inv', p));
    assert.doesNotMatch(t, /quote/i, id);
    assert.ok(t.includes('Invoices sent') && t.includes('Invoices paid') && t.includes('Estimates approved'), id);
    if (p.owed.total > 0) {
      assert.ok(t.includes(money(p.owed.total)) && t.includes('Still owed to you') && t.includes('View invoices'), `${id} owed`);
      assert.ok(t.includes(`${p.owed.count} invoice${p.owed.count === 1 ? '' : 's'}`), `${id} owed count`);
    }
  }
  assert.ok(text(html('inv', redesignPayload('oneInvoiceWeek'))).includes('1 invoice'));
  assert.ok(text(html('inv', redesignPayload('fortyInvoicesWeek'))).includes('40 invoices'));
});

test('invoices: nothing owed shows the caught-up card; an old payload drops the rows it never had', () => {
  const none = { ...redesignPayload('normalWeek'), owed: { total: 0, count: 0, invoices: [] }, viewedUnpaid: 0 };
  const t = text(html('inv', none));
  assert.ok(t.includes('You’re all caught up.') && !t.includes('View invoices'));
  const o = text(html('inv', old(redesignPayload('normalWeek'))));
  assert.ok(o.includes('Invoices paid') && !o.includes('Invoices sent') && !o.includes('Estimates approved'));
});

test('invoices: a row that is 0 says None this time; past 20 the pips stop and "+n" shows', () => {
  const z = { ...redesignPayload('normalWeek'), invoicesSent: 0, estimatesApproved: 0 };
  assert.ok(text(html('inv', z)).includes('None this time'));
  const big = { ...redesignPayload('normalWeek'), invoicesSent: 40 };
  const h = html('inv', big);
  assert.ok(text(h).includes('+20'));
  assert.equal((h.match(/data-d="\d+" data-dur="260"/g) ?? []).length >= 20, true);
});

test('top client: name, amount, share and invoice count are topClient\'s; initials come from the name', () => {
  for (const id of IDS) {
    const p = redesignPayload(id);
    if (!p.topClient) continue;
    const t = text(html('client', p));
    assert.ok(t.includes(p.topClient.name) && t.includes(money(p.topClient.amount)), id);
    assert.ok(t.includes(`${p.topClient.pct}%`), `${id} pct`);
    assert.ok(t.includes(p.topClient.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()), `${id} initials`);
  }
  const oneName = { ...redesignPayload('normalWeek'), topClient: { name: 'cher', amount: 90, pct: 5, invoiceCount: 1 } };
  assert.ok(text(html('client', oneName)).includes('C'));
});

test('top client: an old payload (no pct, no invoice count) leaves those out and still plays', () => {
  const t = text(html('client', old(redesignPayload('normalWeek'))));
  assert.ok(!t.includes('of everything you collected'));
  assert.ok(!/invoices? paid/.test(t));
  assert.ok(t.includes('paid you'));
});

test('free plan: the ordinal and the body follow freeRecapNumber', () => {
  const p = redesignPayload('normalWeek');
  const first = text(html('free', { ...p, freeRecapNumber: 1 }));
  assert.ok(first.includes('This was your 1st free recap.') && first.includes('you have 1 more coming'));
  const last = text(html('free', { ...p, freeRecapNumber: 2 }));
  assert.ok(last.includes('This was your 2nd free recap.') && last.includes('this was the last one'));
  assert.ok(last.includes('See On It Pro') && last.includes('$15 a month'));
});

test('sequence: the free slide plays on the free plan only, and only with a free recap number', () => {
  const p = redesignPayload('normalWeek');
  assert.ok(!redesignSequence({ ...p, freeRecapNumber: 1 }, { plan: 'pro' }).includes('free'));
  assert.ok(redesignSequence({ ...p, freeRecapNumber: 1 }, { plan: 'free' }).includes('free'));
  assert.ok(!redesignSequence({ ...p, freeRecapNumber: undefined }, { plan: 'free' }).includes('free'));
  assert.equal(redesignSequence({ ...p, freeRecapNumber: 2 }, { plan: 'free' }).at(-1), 'aff');
});

test('affirmation: the owner\'s nth line, "-by On It CEO", Share, no signer; the export frame carries the logo', () => {
  const p = { ...redesignPayload('normalWeek'), recapIndex: 3 };
  const h = html('aff', p, 'owner-1');
  const t = text(h);
  assert.ok(t.includes(pickAffirmation('owner-1', 3)));
  assert.ok(t.includes('-by On It CEO') && !t.includes('Onit') && t.includes('Share'));
  assert.doesNotMatch(t, /Deffeu|CEO of On It/);
  assert.ok(h.includes('width:360px;height:640px') && h.includes('apple-icon-180.png'), 'export frame');
  // a different owner or a different recap number picks by the owner's own order
  assert.equal(pickAffirmation('owner-1', 3), pickAffirmation('owner-1', 3));
  assert.ok(text(html('aff', { ...p, recapIndex: undefined })).includes(pickAffirmation('owner-1', 0)), 'old payload: first line');
});

test('share: the sheet when files can be shared, a saved file when not; a closed sheet is not an error', () => {
  assert.equal(shareRoute(true), 'share');
  assert.equal(shareRoute(false), 'save');
  assert.equal(isShareCancel(new DOMException('x', 'AbortError')), true);
  assert.equal(isShareCancel(new Error('boom')), false);
  assert.equal(shareErrorMessage(new Error('canvas is tainted')), 'Couldn’t make the image: canvas is tainted');
  assert.equal(shareErrorMessage('?'), 'Couldn’t make the image.');
});

test('money in: bank, PayPal and Venmo keep the old slide\'s colours and marks', () => {
  const p = { ...redesignPayload('normalWeek'), paymentMethods: [
    { method: 'bank' as const, amount: 300 }, { method: 'paypal' as const, amount: 200 }, { method: 'venmo' as const, amount: 100 },
  ] };
  const h = html('in', p);
  assert.ok(h.includes('background:#5b77a8') && h.includes('account_balance'), 'bank');
  assert.ok(h.includes(`background:${payMark('paypal').color}`) && h.includes(`background:${payMark('venmo').color}`), 'brand colours');
  assert.equal((h.match(/<svg role="img"/g) ?? []).length, 2, 'paypal and venmo draw their marks');
});

test('encouragement lines: the design\'s patterns, only where the design draws them, never shaming', () => {
  const p = redesignPayload('normalWeek');
  const one = { ...p, collected: { ...p.collected, payments: 1, total: 180 }, previous: null };
  assert.equal(moneyInNote(one), 'One job, done and paid. That counts.');
  assert.ok(text(html('in', one)).includes('One job, done and paid.'));
  assert.equal(moneyInNote({ ...p, previous: { income: 0, expenses: 0 } }), null, 'a normal week gets none');
  assert.equal(moneyInNote({ ...p, collected: { ...p.collected, payments: 3, total: 400 }, previous: { income: 900, expenses: 0 } }), 'A lighter week. The work still counts.');
  // kept: only without a change chip
  const noChip = { ...p, change: null };
  assert.equal(keptNote(p), p.change ? null : keptNote(noChip));
  assert.equal(keptNote({ ...noChip, spend: { ...p.spend, total: 0 }, net: 500 }), 'Every dollar stayed with you this week.');
  const loss = keptNote({ ...noChip, net: -120 });
  assert.equal(loss, 'Money went back into the business this week. That’s how it grows.');
  assert.ok(text(html('kept', { ...noChip, net: -120 })).includes('That’s how it grows.'));
  assert.equal(keptNote({ ...noChip, spend: { ...p.spend, total: 0 }, net: 0, income: { ...p.income, total: 0 }, collected: { ...p.collected, total: 0 } }), null);
  for (const id of IDS) {
    const q = redesignPayload(id);
    for (const line of [moneyInNote(q), keptNote(q), keptNote({ ...q, change: null })]) {
      if (line) assert.doesNotMatch(line, /\b(fail|bad|poor|only|behind|loss|lost|worse|should|disappoint)/i, `${id}: ${line}`);
    }
  }
});

test('opener: an old payload falls back to income.total and drops what it never had', () => {
  const p = old(redesignPayload('normalWeek'));
  const t = text(html('opener', p));
  assert.ok(t.includes(money(p.income.total)));
  assert.ok(!t.includes('Invoices sent'));
});
