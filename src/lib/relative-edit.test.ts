import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerKind, detectRelativeEdit, pendingFromAsk, resolveRelativeEdit } from './relative-edit';

const FLOORING = { description: 'Laminate flooring installation, demolishing tiles and carpet removing', qty: 3150, unit_price: 2, unit: 'sq ft' as const };
const STAIRS = { description: 'Staircase renovation', qty: 1, unit_price: 800 };
const FENCE = { description: 'Fence repair', qty: 1, unit_price: 250 };
const DRAFT = [FLOORING, STAIRS, FENCE];

const run = (message: string, lastAssistant = '', modelItems = DRAFT) => {
  const r = resolveRelativeEdit({ message, lastAssistant, draftItems: DRAFT, modelItems, taxRate: 0 });
  return r ? { items: r.items, reply: r.reply ?? '' } : null;
};

test('detects the common phrasings', () => {
  assert.deepEqual(detectRelativeEdit('Decrease the first item by 600'), { dir: -1, amount: 600, isMoney: false, target: 'first' });
  assert.deepEqual(detectRelativeEdit('Reduce first item by $100'), { dir: -1, amount: 100, isMoney: true, target: 'first' });
  assert.equal(detectRelativeEdit('take $50 off the stairs')?.target, 'stairs');
  assert.equal(detectRelativeEdit('add 100 to the fence repair')?.dir, 1);
  assert.equal(detectRelativeEdit('increase the fence repair by 2k')?.amount, 2000);
});

test('not relative edits', () => {
  assert.equal(detectRelativeEdit('reduce the total by 100'), null);
  assert.equal(detectRelativeEdit('add trash removal 150'), null);
  assert.equal(detectRelativeEdit('make the total 7500'), null);
});

test('bare number on a per-unit line: asks, changes nothing', () => {
  const r = run('Decrease the first item by 600');
  assert.ok(r);
  assert.equal(r.items[0].qty, 3150);
  assert.equal(r.items[0].unit_price, 2);
  assert.match(r.reply, /^Take \$600\.00 off .+: dollars, or 600 sq ft\? Reply "dollars" or "sq ft"\.$/);
});

test('the ask round-trips and the answer is applied in code', () => {
  const ask = run('Decrease the first item by 600')!.reply;
  const p = pendingFromAsk(ask);
  assert.ok(p);
  assert.equal(p.amount, 600);
  const units = run('sq ft', ask)!;
  assert.equal(units.items[0].qty, 2550);
  assert.equal(units.items[0].unit_price, 2);
  assert.match(units.reply, /from 3150 to 2550 sq ft\. Total: \$6,150\.00\./);
  const dollars = run('dollars', ask)!;
  assert.equal(dollars.items[0].unit_price, 1.81);
  assert.match(dollars.reply, /Took \$600\.00 off/);
  assert.match(dollars.reply, /that line is \$1\.50 over/);
});

test('explicit dollars apply at once, with an honest miss', () => {
  const r = run('Reduce first item by $100')!;
  assert.equal(r.items[0].unit_price, 1.97);
  assert.match(r.reply, /\$1\.97 each/);
  assert.match(r.reply, /that line is \$5\.50 over/);
});

test('flat line: a bare number is dollars, exact', () => {
  const r = run('take 50 off the stairs')!;
  assert.equal(r.items[1].unit_price, 750);
  assert.equal(r.reply, 'Took $50.00 off Staircase renovation: now $750.00. Total: $7,300.00. Ready to send?');
});

test('never goes negative; unknown or unclear line is left to the model', () => {
  assert.match(run('take 900 off the stairs')!.reply, /negative/);
  assert.equal(run('take 50 off the garage'), null);
  assert.equal(run('hello'), null);
});

test('answer that is neither dollars nor units is not applied', () => {
  assert.equal(answerKind('maybe', 'sq ft'), null);
  assert.equal(answerKind('both', 'sq ft'), null);
  const ask = run('Decrease the first item by 600')!.reply;
  assert.equal(run('what', ask), null);
});

test('model prose can never start the flow', () => {
  assert.equal(pendingFromAsk('Take $600.00 off the flooring, ok?'), null);
});
