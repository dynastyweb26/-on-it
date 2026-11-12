import test from 'node:test';
import assert from 'node:assert/strict';
import { applyExpectedFail } from '../../../scripts/evals/run';

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
