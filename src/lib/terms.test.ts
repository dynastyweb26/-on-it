import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanTerms, readProfileTerms, termsSnapshot, TERMS_MAX } from './terms';

test('cleanTerms trims, empties to null, caps length', () => {
  assert.equal(cleanTerms('  hi  '), 'hi');
  assert.equal(cleanTerms('   '), null);
  assert.equal(cleanTerms(null), null);
  assert.equal(cleanTerms(5), null);
  assert.equal(cleanTerms('x'.repeat(TERMS_MAX + 10))?.length, TERMS_MAX);
});

test('cleanTerms normalizes Unicode compatibility forms and strips format and control chars', () => {
  // NFKC converts compatibility characters (e.g. fullwidth 'Ｎｅｔ　３０' -> 'Net 30')
  assert.equal(cleanTerms('Ｎｅｔ　３０'), 'Net 30');
  // Invisible format control characters (\p{Cf}, e.g. zero-width space U+200B) stripped
  assert.equal(cleanTerms('Net\u200B 30'), 'Net 30');
  // ASCII control characters stripped and CRLF normalized to LF
  assert.equal(cleanTerms('Net 30\r\nDue upon receipt\u0000\u0007'), 'Net 30\nDue upon receipt');
  // String consisting solely of control/format characters cleans to null
  assert.equal(cleanTerms('\u200B\u0000\u0007   \r\n'), null);
});

test('termsSnapshot is empty when there is nothing to freeze', () => {
  assert.deepEqual(termsSnapshot(null), {});
  assert.deepEqual(termsSnapshot('A'), { terms: 'A' });
});

test("readProfileTerms degrades to null when the column is missing or the call throws", async () => {
  const mk = (res: { data: unknown; error: unknown } | Error) => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => { if (res instanceof Error) throw res; return res; } }),
      }),
    }),
  });
  await Promise.all([
    readProfileTerms(mk({ data: { terms: ' T ' }, error: null }), 'u').then((v) => assert.equal(v, 'T')),
    readProfileTerms(mk({ data: null, error: { code: '42703' } }), 'u').then((v) => assert.equal(v, null)),
    readProfileTerms(mk(new Error('boom')), 'u').then((v) => assert.equal(v, null)),
  ]);
});
