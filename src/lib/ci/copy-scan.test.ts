// The scanner is what makes the copy-guard trustworthy, so it is tested on
// its own: it must catch the shapes that leaked before and ignore the stored
// value, comments and routes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanSource, overBaseline, toBaseline, type Baseline } from './copy-scan';

const tsx = (s: string) => scanSource('x.tsx', s);

test('counts prose string literals, template literals and JSX text', () => {
  assert.equal(tsx(`const a = 'Delete quote';`).copy, 1);
  assert.equal(tsx('const a = `Here is your quote for ${who}`;').copy, 1);
  assert.equal(tsx(`const a = <span>New quote</span>;`).copy, 1);
  assert.equal(tsx(`const a = <b>Quoted total</b>;`).copy, 1);
  assert.equal(tsx(`const l = "Quotes";`).copy, 1);
});

test('counts text after a template expression', () => {
  assert.equal(tsx('const a = `${n} saved quotes today`;').copy, 1);
});

test('ignores the stored value, routes, identifiers and comments', () => {
  assert.equal(tsx(`const k = row.kind === 'quote';`).copy, 0);
  assert.equal(tsx(`fetch('/api/quotes/123');`).copy, 0);
  assert.equal(tsx(`const q = 'quote_total';`).copy, 0);
  assert.equal(tsx(`// a quote goes here\nconst a = 1;`).copy, 0);
  assert.equal(tsx(`/* New quote */ const a = 1;`).copy, 0);
  assert.equal(tsx(`const quote = 1;`).copy, 0);
});

test('"quotation" is not the retired word', () => {
  assert.equal(tsx(`const a = 'Get a quotation';`).copy, 0);
});

test('flags the ternary that prints the stored kind', () => {
  assert.equal(tsx(`const noun = kind === 'quote' ? 'quote' : 'invoice';`).ternary, 1);
  assert.equal(tsx(`const noun = kind === 'quote' ? 'estimate' : 'invoice';`).ternary, 0);
});

test('a ternary inside a comment does not count', () => {
  assert.equal(tsx(`// kind === 'quote' ? 'quote' : 'invoice'\nconst a = 1;`).ternary, 0);
});

test('baseline ratchet: equal passes, higher fails, new file fails', () => {
  const base: Baseline = { version: 1, copy: { 'a.tsx': 2 }, ternary: {} };
  assert.deepEqual(overBaseline({ 'a.tsx': { copy: 2, ternary: 0 } }, base), []);
  assert.deepEqual(overBaseline({ 'a.tsx': { copy: 1, ternary: 0 } }, base), []);
  assert.equal(overBaseline({ 'a.tsx': { copy: 3, ternary: 0 } }, base).length, 1);
  assert.equal(overBaseline({ 'b.tsx': { copy: 1, ternary: 0 } }, base).length, 1);
  assert.equal(overBaseline({ 'a.tsx': { copy: 2, ternary: 1 } }, base).length, 1);
});

test('toBaseline drops zero entries and sorts', () => {
  const b = toBaseline({ 'z.ts': { copy: 0, ternary: 0 }, 'b.ts': { copy: 2, ternary: 0 }, 'a.ts': { copy: 1, ternary: 3 } });
  assert.deepEqual(Object.keys(b.copy), ['a.ts', 'b.ts']);
  assert.deepEqual(b.ternary, { 'a.ts': 3 });
});
