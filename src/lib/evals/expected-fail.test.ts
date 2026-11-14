import test from 'node:test';
import assert from 'node:assert/strict';
import { applyExpectedFail, isSignedOut, matchingToolSet, runCase, summarizeResults, templateMismatch } from '../../../scripts/evals/run';

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

test('a case says "signedOut": true, and the older "signedIn": false still works', () => {
  assert.equal(isSignedOut({ signedOut: true }), true);
  assert.equal(isSignedOut({ signedIn: false }), true);
  assert.equal(isSignedOut({ signedIn: true }), false);
  assert.equal(isSignedOut({}), false);
  assert.equal(isSignedOut({ signedOut: false, signedIn: false }), true);
});

test('a case that names no templateId does not grade the card', () => {
  assert.equal(templateMismatch({}, 'stat.tiles'), null);
  assert.equal(templateMismatch({}, null), null);
  assert.equal(templateMismatch({ templateId: 'list.ranked' }, 'list.ranked'), null);
  assert.match(String(templateMismatch({ templateId: 'list.ranked' }, 'stat.tiles')), /template stat.tiles != expected list.ranked/);
  // An explicit null is the only way to demand no card.
  assert.equal(templateMismatch({ templateId: null }, null), null);
  assert.match(String(templateMismatch({ templateId: null }, 'nav.link')), /expected null/);
});

test('a signed-out case passes when no tool ran and nothing was written', async () => {
  const signedOut = (over: Record<string, unknown> = {}) => caseOf({ signedOut: true, ...over });
  assert.equal((await runCase(signedOut(), null)).pass, true);
  assert.equal((await runCase(signedOut({ signedIn: false }), null)).pass, true);
  // A case that still spells out the refusal keeps working.
  assert.equal((await runCase(signedOut({ expect: { refused: true } }), null)).pass, true);
  // But a signed-out case may not expect a tool, a write or a card.
  const tool = await runCase(signedOut({ expect: { tools: ['unpaid_invoices'], writes: 0 } }), null);
  assert.equal(tool.pass, false);
  assert.match(tool.reasons.join(' '), /cannot expect a tool/);
  assert.equal((await runCase(signedOut({ expect: { tools: [], writes: 1 } }), null)).pass, false);
  assert.equal((await runCase(signedOut({ expect: { tools: [], templateId: 'stat.tiles' } }), null)).pass, false);
});

test('the last tool that ran is the answer; an earlier lookup does not fail a case', () => {
  const expect = { tools: ['list_invoices'], templateId: 'list.ranked' };
  assert.equal(matchingToolSet(expect, ['list_invoices'])?.templateId, 'list.ranked');
  assert.equal(matchingToolSet(expect, ['find_client', 'list_invoices'])?.templateId, 'list.ranked');
  // The answer is the last call, so a case cannot be satisfied by an old lookup.
  assert.equal(matchingToolSet(expect, ['list_invoices', 'find_client']), undefined);
  // Nothing expected means nothing may have run.
  assert.equal(matchingToolSet({ tools: [] }, ['unpaid_invoices']), undefined);
  assert.equal(matchingToolSet({ tools: [] }, [])?.tools.length, 0);
});

test('"toolsExact": true still requires the whole sequence, in order', () => {
  const expect = { tools: ['find_client', 'list_invoices'], toolsExact: true };
  assert.ok(matchingToolSet(expect, ['find_client', 'list_invoices']));
  assert.equal(matchingToolSet(expect, ['find_client', 'get_invoice', 'list_invoices']), undefined);
  assert.equal(matchingToolSet(expect, ['list_invoices']), undefined);
});
