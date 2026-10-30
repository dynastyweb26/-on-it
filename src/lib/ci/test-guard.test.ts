import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, isTestFile, type GuardInput } from './test-guard';

const base = (over: Partial<GuardInput> = {}): GuardInput => ({
  files: [], testPatch: '', labels: [], baseline: { before: null, after: null }, ...over,
});

test('a clean PR passes', () => {
  const r = analyze(base({ files: [{ status: 'M', path: 'src/app/page.tsx' }] }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.violations, []);
});

test('deleting a test file fails', () => {
  const r = analyze(base({ files: [{ status: 'D', path: 'src/lib/documents.test.ts' }] }));
  assert.equal(r.ok, false);
  assert.match(r.violations[0], /Deleted test file/);
});

test('adding a test file is fine', () => {
  assert.equal(analyze(base({ files: [{ status: 'A', path: 'src/lib/x.test.ts' }] })).ok, true);
});

test('unconditional skips and focus fail; conditional skip is allowed', () => {
  const bad = ["+test.skip('later', () => {});", "+it.only('x', () => {});", "+describe.skip('s', () => {});", "+  { skip: true },", "+xit('x', () => {});"];
  for (const line of bad) {
    const r = analyze(base({ testPatch: line }));
    assert.equal(r.ok, false, line);
  }
  assert.equal(analyze(base({ testPatch: "+test.skip(!process.env.E2E_EMAIL, 'needs test account');" })).ok, true);
});

test('removing more assertions than added fails', () => {
  const patch = ['-  assert.equal(a, 1);', '-  assert.ok(b);', '+  assert.equal(a, 1);'].join('\n');
  const r = analyze(base({ testPatch: patch }));
  assert.equal(r.ok, false);
  assert.match(r.violations[0], /Net assertions removed/);
});

test('moving assertions around (equal counts) is fine', () => {
  const patch = ['-  assert.equal(a, 1);', '+  assert.equal(a, 2);'].join('\n');
  assert.equal(analyze(base({ testPatch: patch })).ok, true);
});

test('changing workflows or CI scripts fails; adding them does not', () => {
  assert.equal(analyze(base({ files: [{ status: 'M', path: '.github/workflows/ci.yml' }] })).ok, false);
  assert.equal(analyze(base({ files: [{ status: 'M', path: 'src/lib/ci/test-guard.ts' }] })).ok, false);
  assert.equal(analyze(base({ files: [{ status: 'A', path: '.github/workflows/new.yml' }] })).ok, true);
});

test('raising the copy baseline fails; lowering it passes', () => {
  const before = JSON.stringify({ version: 1, copy: { 'a.tsx': 2 }, ternary: {} });
  const higher = JSON.stringify({ version: 1, copy: { 'a.tsx': 3 }, ternary: {} });
  const lower = JSON.stringify({ version: 1, copy: { 'a.tsx': 1 }, ternary: {} });
  const added = JSON.stringify({ version: 1, copy: { 'a.tsx': 2, 'b.tsx': 1 }, ternary: {} });
  assert.equal(analyze(base({ baseline: { before, after: higher } })).ok, false);
  assert.equal(analyze(base({ baseline: { before, after: added } })).ok, false);
  assert.equal(analyze(base({ baseline: { before, after: lower } })).ok, true);
});

test('the tests-approved label overrides, and is reported', () => {
  const r = analyze(base({ files: [{ status: 'D', path: 'src/a.test.ts' }], labels: ['tests-approved'] }));
  assert.equal(r.ok, true);
  assert.equal(r.approved, true);
  assert.equal(r.violations.length, 1);
});

test('isTestFile', () => {
  assert.equal(isTestFile('src/lib/a.test.ts'), true);
  assert.equal(isTestFile('tests/e2e/public.spec.ts'), true);
  assert.equal(isTestFile('tests/copy-baseline.json'), false);
  assert.equal(isTestFile('src/lib/a.ts'), false);
});
