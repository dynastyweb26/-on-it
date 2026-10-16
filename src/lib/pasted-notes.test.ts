import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPasteItems, applyPasteReplies, customerNotes, isPastedNotes, LABOR_QUESTION,
  pasteContext, parsePastedNotes, PRICES_QUESTION, privateNotes, scrubCostPrices,
} from './pasted-notes';
import { calculateInvoiceTotals } from './financials';
import { CARD_1_NO_PRICES, CARD_2_TORTILLA_WARMER } from './__fixtures__/pasted-cards';

type Item = { description: string; qty: number; unit_price: number | null; unit?: null; detail?: string | null };

// A model result as /api/parse receives it, deliberately wrong in every way
// the rules forbid, so the guard (not the model) has to make it right.
function badModelResult(overrides: Record<string, unknown> = {}) {
  return {
    intent: 'question' as 'invoice' | 'quote' | 'expense' | 'question' | 'other',
    intent_explicit: false,
    client_name: null as string | null,
    line_items: [
      { description: 'Tortilla warmer will not turn on', qty: 1, unit_price: null },
      { description: 'Thermostat replacement', qty: 1, unit_price: 56 },
      { description: 'Rocker switch', qty: 1, unit_price: 27.3 },
    ] as Item[],
    notes: 'Thermostat cost C$56. Tech Dean.' as string | null,
    private_notes: null as string | null,
    expense: null as unknown,
    missing: [] as string[],
    reply: 'On it! Is this a bill or an expense? The thermostat was $56.',
    ready: false,
    ...overrides,
  };
}

const NO_COST = (r: unknown) => {
  const s = JSON.stringify(r);
  assert.ok(!/\b56\b|27\.3/.test(s), `cost price leaked: ${s}`);
  assert.ok(!/C\$/.test(s), `cost tag leaked: ${s}`);
};

test('both cards are detected as pasted notes; a spoken job is not', () => {
  assert.equal(isPastedNotes(CARD_1_NO_PRICES), true);
  assert.equal(isPastedNotes(CARD_2_TORTILLA_WARMER), true);
  assert.equal(isPastedNotes('Fixed the leaky faucet for Maria, 150'), false);
});

test('card 2: exactly two items, verbatim names + part numbers, list price billed', () => {
  const p = parsePastedNotes(CARD_2_TORTILLA_WARMER);
  assert.deepEqual(p.items, [
    { description: 'Hatco thermostat', qty: 1, unit: 'each', unit_price: 80, detail: 'P# 02-16-039' },
    { description: 'Hatco rocker switch', qty: 1, unit: 'each', unit_price: 39, detail: 'P# 02-19-215' },
  ]);
  assert.deepEqual(p.costPrices, [56, 27.3]);
  assert.equal(p.hasSellPrice, true);
  assert.equal(calculateInvoiceTotals(p.items, 0, 'none', 0).total, 119);
});

test('card 2: customer notes = title, work performed, reference; names private; no cost anywhere', () => {
  const p = parsePastedNotes(CARD_2_TORTILLA_WARMER);
  assert.equal(customerNotes(p),
    'tortilla warmer will not turn on\nWork performed: Damaged thermostat; Failed rocker switch\nReference: WO# 366060664');
  const priv = privateNotes(p) ?? '';
  assert.match(priv, /Tech ~ Dean/);
  assert.match(priv, /MOD ~ Raul/);
  assert.match(priv, /^Notes: The thermostat and rocker switch/m);
  assert.doesNotMatch(customerNotes(p) ?? '', /Dean|Raul|Upon inspection|rusting/);
  assert.doesNotMatch(priv, /Upon inspection/);
  NO_COST({ c: customerNotes(p), priv, items: p.items });
});

test('card 1: no items, findings sorted under their area, names private', () => {
  const p = parsePastedNotes(CARD_1_NO_PRICES);
  assert.deepEqual(p.items, []);
  assert.equal(p.jobTitle, 'WIC not cooling and WIF freezer ice build up');
  assert.deepEqual(p.findings, [
    'WIC: Partially frozen evap ( Defrosted with hose)',
    'WIF: Drain line insulation not installed properly (Repaired)',
  ]);
  assert.match(privateNotes(p) ?? '', /Mod -Fallon/);
  assert.match(privateNotes(p) ?? '', /Tech- AJ \/ Milo/);
});

test('REGRESSION card 2 through the guard: exactly 2 items totaling $119.00', () => {
  const ctx = pasteContext([{ role: 'user', content: CARD_2_TORTILLA_WARMER }])!;
  const r = applyPasteReplies(applyPasteItems(badModelResult(), ctx), ctx);
  assert.equal(r.line_items.length, 2, 'any third line item fails');
  assert.equal(calculateInvoiceTotals(r.line_items as never, 0, 'none', 0).total, 119);
  assert.equal(r.intent, 'invoice'); // L$ present → invoice, no bill-or-expense question
  assert.doesNotMatch(r.reply, /expense/i);
  NO_COST(r);
});

test('card 2 follow-up turns: model echoing cost prices is corrected; labor asked once', () => {
  const history = [
    { role: 'user', content: CARD_2_TORTILLA_WARMER },
    { role: 'assistant', content: "On it! Who's this for?" },
    { role: 'user', content: 'Taco Spot' },
  ];
  let ctx = pasteContext(history)!;
  let r = applyPasteReplies(applyPasteItems(badModelResult({
    intent: 'invoice', client_name: 'Taco Spot', reply: 'Got it.',
    line_items: [
      { description: 'Hatco thermostat', qty: 1, unit_price: 56 },
      { description: 'Hatco rocker switch', qty: 1, unit_price: 39 },
      { description: 'tortilla warmer will not turn on', qty: 1, unit_price: null },
    ],
  }), ctx), ctx);
  assert.equal(r.line_items.length, 2);
  assert.deepEqual(r.line_items.map((li) => li.unit_price), [80, 39]);
  assert.equal(r.reply, LABOR_QUESTION);
  assert.equal(r.ready, false);
  NO_COST(r);

  // "No" → no labor line, not asked again.
  ctx = pasteContext([...history, { role: 'assistant', content: LABOR_QUESTION }, { role: 'user', content: 'No' }])!;
  r = applyPasteReplies(applyPasteItems(badModelResult({
    intent: 'invoice', client_name: 'Taco Spot', reply: 'All set.', ready: true,
    line_items: [
      { description: 'Hatco thermostat', qty: 1, unit_price: 80 },
      { description: 'Hatco rocker switch', qty: 1, unit_price: 39 },
    ],
  }), ctx), ctx);
  assert.equal(r.line_items.length, 2);
  assert.notEqual(r.reply, LABOR_QUESTION);
  assert.equal(r.ready, true);
});

test('card 1 through the guard: no invented price, asks for prices', () => {
  const ctx = pasteContext([{ role: 'user', content: CARD_1_NO_PRICES }])!;
  const r = applyPasteReplies(applyPasteItems(badModelResult({
    line_items: [{ description: 'WIC not cooling', qty: 1, unit_price: 150 }],
  }), ctx), ctx);
  assert.deepEqual(r.line_items, []);
  assert.equal(r.ready, false);
  assert.ok(r.missing.includes('price'));
  assert.equal(r.reply, `On it! ${PRICES_QUESTION}`);
});

test('card 1: an answer with no figure asks again naming the item', () => {
  const ctx = pasteContext([
    { role: 'user', content: CARD_1_NO_PRICES },
    { role: 'assistant', content: `On it! ${PRICES_QUESTION}` },
    { role: 'user', content: 'look at the prices' },
  ])!;
  const r = applyPasteReplies(applyPasteItems(badModelResult({ intent: 'invoice', line_items: [] }), ctx), ctx);
  assert.equal(r.reply, 'I still need a price. How much for partially frozen evap ( Defrosted with hose)?');

  // Seen on the preview: the model called the answer a question and turned
  // the findings into price-less lines, so the name question came instead.
  const r2 = applyPasteReplies(applyPasteItems(badModelResult({
    intent: 'question', reply: "Who's this for?",
    line_items: [
      { description: 'Partially frozen evap ( Defrosted with hose)', qty: 1, unit_price: null },
      { description: 'Drain line insulation not installed properly (Repaired)', qty: 1, unit_price: null },
    ],
  }), ctx, 'invoice'), ctx);
  assert.deepEqual(r2.line_items, []);
  assert.equal(r2.intent, 'invoice');
  assert.equal(r2.reply, 'I still need a price. How much for partially frozen evap ( Defrosted with hose)?');
});

test('qty + unit from the text: "1028 sqft" → qty 1028, unit sq ft', () => {
  const p = parsePastedNotes('Floor job\nUpon inspection I found the following:\n1. Worn coating\nEpoxy floor coating 1028 sqft ~ C$1.10 ~ L$2.50');
  assert.deepEqual(p.items, [{ description: 'Epoxy floor coating 1028 sqft', qty: 1028, unit: 'sq ft', unit_price: 2.5 }]);
});

test('scrubCostPrices removes C$ tokens and $-prefixed cost figures only', () => {
  assert.equal(scrubCostPrices('Part was C$56, billed $80. Qty 56.', [56]), 'Part was, billed $80. Qty 56.');
  assert.equal(scrubCostPrices('Switch $27.30 each', [27.3]), 'Switch each');
});
