import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectTargetTotal, pendingTargetFromAsk, pickLine, resolveTargetTotal, shortName } from './target-total';

const FLOORING = { description: 'Laminate flooring installation, demolishing tiles and carpet removing', qty: 3150, unit_price: 2 };
const STAIRS = { description: 'Staircase renovation', qty: 1, unit_price: 800 };
const FENCE = { description: 'Fence repair', qty: 1, unit_price: 250 };
const DRAFT = [FLOORING, STAIRS, FENCE]; // 6300 + 800 + 250 = 7350

test('detects the target in Cyril exact message', () => {
  assert.equal(detectTargetTotal('No its still 3150 sqft just make sure the new project total is 7500'), 7500);
});

test('detects common phrasings', () => {
  assert.equal(detectTargetTotal('make the total 7,500'), 7500);
  assert.equal(detectTargetTotal('the total should be $7500.50'), 7500.5);
  assert.equal(detectTargetTotal('bring the total to 8k'), 8000);
  assert.equal(detectTargetTotal('make it come to 7500'), 7500);
  assert.equal(detectTargetTotal('estimate total 7500'), 7500);
});

test('does not treat other numbers as a target', () => {
  assert.equal(detectTargetTotal('Decrease the first item by 600'), null);
  assert.equal(detectTargetTotal('add trash removal 150'), null);
  assert.equal(detectTargetTotal('make it 50'), null);
  assert.equal(detectTargetTotal('the total is wrong'), null);
  assert.equal(detectTargetTotal('fence total 250'), null);
});

test('only the app own ask sentence starts a pending target', () => {
  const ask = 'Total is $7,550.00, $50.00 over your $7,500.00 target. Which line should I change?';
  assert.equal(pendingTargetFromAsk(ask), 7500);
  assert.equal(pendingTargetFromAsk('I adjusted it to hit your $7,500.00 target.'), null);
});

test('picks a line by ordinal, last, number or name; null when unclear', () => {
  assert.equal(pickLine('the first one', DRAFT), 0);
  assert.equal(pickLine('2', DRAFT), 1);
  assert.equal(pickLine('the last one', DRAFT), 2);
  assert.equal(pickLine('the fence repair', DRAFT), 2);
  assert.equal(pickLine('stairs', DRAFT), 1);
  assert.equal(pickLine('flooring', DRAFT), 0);
  assert.equal(pickLine('never mind', DRAFT), null);
  assert.equal(pickLine('repair the stairs and fence', DRAFT), null);
});

test('short name is text up to the first comma', () => {
  assert.equal(shortName(FLOORING.description), 'Laminate flooring installation');
});

// ── The Nov 7 preview run: model changed Fence repair 250 -> 450 to chase 7500 ──
test('reverts the model silent price change and asks which line to change', () => {
  const modelItems = [FLOORING, STAIRS, { ...FENCE, unit_price: 450 }]; // total 7550
  const r = resolveTargetTotal({
    message: 'No its still 3150 sqft just make sure the new project total is 7500',
    lastAssistant: '',
    draftItems: DRAFT,
    modelItems,
    taxRate: 0,
  });
  assert.ok(r);
  assert.equal(r.items[2].unit_price, 250); // reverted
  assert.equal(
    r.reply,
    'Total is $7,350.00, $150.00 under your $7,500.00 target. Which line should I change?',
  );
});

test('reverts the derived $1.97 rate too', () => {
  const modelItems = [{ ...FLOORING, unit_price: 1.97 }, STAIRS, FENCE];
  const r = resolveTargetTotal({ message: 'make sure the total is 7500', lastAssistant: '', draftItems: DRAFT, modelItems, taxRate: 0 });
  assert.equal(r?.items[0].unit_price, 2);
});

test('keeps a qty the user restated ("still 3150 sqft") and a price they stated', () => {
  const draft = [{ ...FLOORING, qty: 2550 }, STAIRS];
  const model = [{ ...FLOORING, qty: 3150 }, STAIRS];
  const r = resolveTargetTotal({ message: 'No its still 3150 sqft just make sure the total is 7500', lastAssistant: '', draftItems: draft, modelItems: model, taxRate: 0 });
  assert.equal(r?.items[0].qty, 3150);
  // 6300 + 800 = 7100, 400 under 7500
  assert.match(r?.reply ?? '', /^Total is \$7,100\.00, \$400\.00 under your \$7,500\.00 target\./);
});

test('already at the target: keep the normal reply', () => {
  const draft = [{ ...FLOORING }, { ...STAIRS }, { ...FENCE, unit_price: 400 }];
  const r = resolveTargetTotal({ message: 'make sure the total is 7500', lastAssistant: '', draftItems: draft, modelItems: draft, taxRate: 0 });
  assert.equal(r?.reply, null);
});

test('the answer applies the change in code and states it', () => {
  const r = resolveTargetTotal({
    message: 'the fence repair',
    lastAssistant: 'Total is $7,350.00, $150.00 under your $7,500.00 target. Which line should I change?',
    draftItems: DRAFT,
    modelItems: DRAFT,
    taxRate: 0,
  });
  assert.ok(r);
  assert.equal(r.items[2].unit_price, 400);
  assert.equal(r.reply, 'Changed Fence repair from $250.00 to $400.00. Total: $7,500.00. Ready to send?');
});

test('a qty line that cannot land exactly says how far off it is', () => {
  const r = resolveTargetTotal({
    message: 'the first one',
    lastAssistant: 'Total is $7,350.00, $149.99 under your $7,499.99 target. Which line should I change?',
    draftItems: DRAFT,
    modelItems: DRAFT,
    taxRate: 0,
  });
  assert.ok(r);
  assert.match(r.reply ?? '', /target\. Ready to send\?$/);
  assert.match(r.reply ?? '', /each\. Total: /);
});

test('a change that would go negative is refused and nothing changes', () => {
  const r = resolveTargetTotal({
    message: 'the fence repair',
    lastAssistant: 'Total is $7,350.00, $7,000.00 over your $350.00 target. Which line should I change?',
    draftItems: DRAFT,
    modelItems: DRAFT,
    taxRate: 0,
  });
  assert.equal(r?.items, DRAFT);
  assert.match(r?.reply ?? '', /negative/);
});

test('tax is solved for: the total, not the subtotal, hits the target', () => {
  const draft = [{ description: 'Deck', qty: 1, unit_price: 1000 }, { description: 'Rail', qty: 1, unit_price: 100 }];
  const r = resolveTargetTotal({
    message: 'the rail',
    lastAssistant: 'Total is $1,188.00, $12.00 under your $1,200.00 target. Which line should I change?',
    draftItems: draft,
    modelItems: draft,
    taxRate: 8,
  });
  // subtotal needed 1200 / 1.08 = 1111.11, so rail = 111.11 and total 1199.99 or 1200.00
  assert.equal(r?.items[1].unit_price, 111.11);
  assert.match(r?.reply ?? '', /Total: \$1,19[89]\.\d\d|Total: \$1,200\.00/);
});

test('an unrelated answer falls through to the normal path', () => {
  const r = resolveTargetTotal({
    message: 'actually add a gate for 300',
    lastAssistant: 'Total is $7,350.00, $150.00 under your $7,500.00 target. Which line should I change?',
    draftItems: DRAFT,
    modelItems: DRAFT,
    taxRate: 0,
  });
  assert.equal(r, null);
});

test('no target and no pending ask: not our turn', () => {
  assert.equal(
    resolveTargetTotal({ message: 'the fence repair', lastAssistant: 'Got it.', draftItems: DRAFT, modelItems: DRAFT, taxRate: 0 }),
    null,
  );
});

test('priceless items: stay out of it', () => {
  const draft = [FLOORING, { description: 'Gutter cleaning', qty: 1, unit_price: null }];
  assert.equal(
    resolveTargetTotal({ message: 'make sure the total is 7500', lastAssistant: '', draftItems: draft, modelItems: draft, taxRate: 0 }),
    null,
  );
});
