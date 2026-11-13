import test from 'node:test';
import assert from 'node:assert/strict';
import { applyExpectedFail, matchingToolSet, summarizeResults } from '../../../scripts/evals/run';

const caseOf = (over: Record<string, unknown> = {}) =>
  ({ id: 'x', request: 'r', fixture: {}, expect: { tools: [] }, ...over }) as never;
const result = (pass: boolean) => ({ id: 'x', tags: [], pass, reasons: pass ? [] : ['bug'] });

test('a failing expectedFail case passes the gate while the bug is there', () => {
  const graded = applyExpectedFail(caseOf({ expectedFail: true, reason: 'old /api/parse flow' }), result(false));
  assert.equal(graded.gatePass, true);
  assert.equal(graded.pass, false);
});

test('an expectedFail case that starts passing fails the gate, so the marker goes', () => {
  const graded = applyExpectedFail(caseOf({ expectedFail: true, reason: 'old /api/parse flow' }), result(true));
  assert.equal(graded.gatePass, false);
  assert.match(graded.reasons.join(' '), /remove the marker/);
});

test('expectedFail without a reason is refused by the gate', () => {
  const graded = applyExpectedFail(caseOf({ expectedFail: true }), result(false));
  assert.equal(graded.gatePass, false);
  assert.match(graded.reasons.join(' '), /needs a reason/);
});

test('ordinary cases keep their own result', () => {
  assert.equal(applyExpectedFail(caseOf(), result(true)).gatePass, true);
  assert.equal(applyExpectedFail(caseOf(), result(false)).gatePass, false);
});

const graded = (id: string, gatePass: boolean, tags: string[] = []) => ({ id, gatePass, tags });

test('the pass-rate gate applies to the whole run, not one file', () => {
  const nineOfTen = Array.from({ length: 10 }, (_, i) => graded(`c${i}`, i < 9));
  assert.equal(summarizeResults(nineOfTen).ok, true);

  const eightOfTen = Array.from({ length: 10 }, (_, i) => graded(`c${i}`, i < 8));
  assert.equal(summarizeResults(eightOfTen).ok, false);
  assert.equal(summarizeResults(eightOfTen).rate, 0.8);
});

test('a case can accept alternative tool sets with their own templates', () => {
  const expect = {
    tools: ['unpaid_invoices'],
    templateId: 'list.ranked',
    alternatives: [{ tools: ['get_client_summary'], templateId: 'stat.tiles' }],
  };
  assert.equal(matchingToolSet(expect, ['unpaid_invoices'])?.templateId, 'list.ranked');
  assert.equal(matchingToolSet(expect, ['get_client_summary'])?.templateId, 'stat.tiles');
  assert.equal(matchingToolSet(expect, ['find_client']), undefined);
});

test('one failing money or send case fails the overall run', () => {
  const mixed = [
    ...Array.from({ length: 19 }, (_, i) => graded(`c${i}`, true)),
    graded('money-case', false, ['money']),
  ];
  const summary = summarizeResults(mixed);
  assert.equal(summary.rate, 0.95);
  assert.equal(summary.ok, false);
  assert.deepEqual(summary.blocking.map((r) => r.id), ['money-case']);
});
